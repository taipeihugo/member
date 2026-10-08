// 線上會員系統資料庫測試：用 PGlite（瀏覽器版 Postgres）執行 線上系統/資料庫結構.sql，
// 模擬 Supabase 的 auth（登入者），逐項檢查權限（RLS）與函式行為
// 用法：node 製作/test/資料庫測試.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const 根目錄 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// 模擬 Supabase 內建的 auth 結構與角色（正式環境由 Supabase 提供）
export const 模擬auth = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
-- 與 Supabase 相同：public 裡新建的資料表、函式、序列，預設把全部權限給 anon、authenticated
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

// 建立一個已載入資料庫結構的 PGlite
export async function 建立資料庫() {
  const db = new PGlite();
  await db.exec(模擬auth);
  await db.exec(fs.readFileSync(path.join(根目錄, "線上系統", "資料庫結構.sql"), "utf8"));
  return db;
}

// 以某位使用者身分執行（null＝未登入 anon）
export async function 以身分(db, 使用者, 動作) {
  await db.exec("reset role");
  if (使用者) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [使用者.id, JSON.stringify({ sub: 使用者.id, email: 使用者.email, role: "authenticated" })]);
    await db.exec("set role authenticated");
  } else {
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
    await db.exec("set role anon");
  }
  try { return await 動作(); } finally {
    // 恢復成「SQL Editor」身分：沒有登入者（auth.uid() 為 null）
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}

// 直接執行測試（被其他測試 import 時不執行）
if (import.meta.url === "file://" + process.argv[1] || process.argv[1].endsWith("資料庫測試.mjs")) {
  let 通過 = 0; const 失敗 = [];
  const 檢查 = (條件, 說明) => { if (條件) { 通過++; console.log("  ✔ " + 說明); } else { 失敗.push(說明); console.log("  ✘ " + 說明); } };
  // 預期會被拒絕的動作
  const 應失敗 = async (動作, 關鍵字) => { try { await 動作(); return false; } catch (e) { return !關鍵字 || String(e.message).includes(關鍵字); } };

  const db = await 建立資料庫();
  // 帳號：秘書長、承辦人、會員甲、會員乙、申請人（尚非會員）、未驗證者
  const 帳 = {};
  for (const [名, 驗證] of [["秘書長", true], ["承辦人", true], ["甲", true], ["乙", true], ["申請人", true], ["未驗證", false]]) {
    帳[名] = { id: crypto.randomUUID(), email: 名 === "未驗證" ? "jia@example.org" : "u" + Object.keys(帳).length + "@example.org" };
    await db.query("insert into auth.users values ($1, $2, $3)", [帳[名].id, 帳[名].email, 驗證 ? new Date().toISOString() : null]);
  }
  帳.甲.email = "jia@example.org"; await db.query("update auth.users set email = $1 where id = $2", ["jia@example.org", 帳.甲.id]);
  await db.query("update auth.users set email = 'jia@example.org' where id = $1", [帳.未驗證.id]);

  console.log("一、第一次設定與帳號連結");
  console.log("  " + (await db.query("select public.make_staff($1, '秘書長', '陳秘書') as r", [帳.秘書長.email])).rows[0].r);
  // 名冊先有甲、乙（例如從 Excel 匯入），尚未連結帳號
  await db.query(`insert into public.members (name, gender, agency, unit, title, email) values
    ('甲會員', '女', '財政部賦稅署', '稅制組', '科員', 'JIA@example.org'), ('乙會員', '男', '財政部關務署', '稽查組', '專員', $1)`, [帳.乙.email]);
  檢查((await 以身分(db, 帳.未驗證, () => db.query("select public.link_my_member() as id"))).rows[0].id === null, "Email 未驗證的帳號不會連結");
  檢查((await 以身分(db, 帳.甲, () => db.query("select public.link_my_member() as id"))).rows[0].id === null, "Email 與名冊相同、已驗證也不會自動連結（避免冒用公務信箱）");
  // 甲、乙用秘書長產生的認領碼連結
  const 起始碼 = (await 以身分(db, 帳.秘書長, () => db.query("select m.email, c.code from public.generate_claim_codes(array(select id from public.members where staff_role = '')) c join public.members m on m.id = c.member_id"))).rows;
  for (const [名, 信箱] of [["甲", "jia@example.org"], ["乙", 帳.乙.email]]) {
    await 以身分(db, 帳[名], () => db.query("select public.claim_with_code($1)", [起始碼.find((c) => c.email === 信箱).code]));
  }
  const 甲id = (await 以身分(db, 帳.甲, () => db.query("select public.link_my_member() as id"))).rows[0].id;
  檢查(!!甲id, "會員用認領碼連結後，link_my_member 回傳自己的會員資料");

  console.log("二、會員只看得到自己");
  檢查((await 以身分(db, 帳.甲, () => db.query("select name from public.members"))).rows.map((r) => r.name).join() === "甲會員", "會員查名冊只看到自己一筆");
  檢查((await 以身分(db, null, () => db.query("select count(*)::int as n from public.members").catch(() => ({ rows: [{ n: -1 }] })))).rows[0].n <= 0, "未登入者讀不到名冊");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("update public.members set board_role = '理事' where name = '甲會員' returning id")).then((r) => { if (!r.rows.length) throw new Error("無列"); })), "會員不能直接改名冊（例如自封理事）");
  await 以身分(db, 帳.甲, () => db.query("select public.update_my_profile('女', '財政部賦稅署', '稽核組', '專員', '分機 123')"));
  const 甲 = (await db.query("select unit, title, phone, board_role, staff_role from public.members where id = $1", [甲id])).rows[0];
  檢查(甲.unit === "稽核組" && 甲.phone === "分機 123" && 甲.board_role === "" && 甲.staff_role === "", "會員可改自己的單位、職稱、電話（不能改職務）");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("insert into public.members (name) values ('偷建')"))), "會員不能新增名冊資料");

  console.log("三、理監事與會員代表");
  const 秘 = (sql, p) => 以身分(db, 帳.秘書長, () => db.query(sql, p));
  await 秘("update public.members set board_role = '理事', board_title = '常務理事', is_representative = true where id = $1", [甲id]);
  const 甲2 = (await db.query("select board_role, board_title, is_representative from public.members where id = $1", [甲id])).rows[0];
  檢查(甲2.board_role === "理事" && 甲2.board_title === "常務理事" && 甲2.is_representative, "會員代表可同時是理事");
  檢查(await 應失敗(() => 秘("update public.members set board_role = '監事', board_title = '常務理事' where id = $1", [甲id])), "理事職稱不能掛在監事身分（理事與監事互斥）");
  await 秘("update public.members set board_role = '監事', board_title = '' where id = $1", [甲id]);
  const 甲3 = (await db.query("select board_role, board_title, is_representative from public.members where id = $1", [甲id])).rows[0];
  檢查(甲3.board_role === "監事" && 甲3.board_title === "監事" && 甲3.is_representative, "改成監事後就不再是理事（同一欄位只能擇一），會員代表仍保留");

  console.log("四、幹部角色");
  await 秘("update public.members set staff_role = '承辦人' where email = $1", [帳.乙.email]);
  檢查((await 以身分(db, 帳.乙, () => db.query("select count(*)::int as n from public.members"))).rows[0].n === 3, "承辦人可看到全部名冊");
  檢查(await 應失敗(() => 以身分(db, 帳.乙, () => db.query("update public.members set staff_role = '秘書長' where email = $1", [帳.乙.email])), "只有理事長"), "承辦人不能把自己升為秘書長");
  await 秘("update public.members set staff_role = '' where email = $1", [帳.乙.email]);
  檢查((await 以身分(db, 帳.乙, () => db.query("select count(*)::int as n from public.members"))).rows[0].n === 1, "取消幹部角色後立即只看得到自己");

  console.log("五、活動報名（含葷素、名額、候補、遞補）");
  const 活 = (await 秘(`insert into public.activities (name, date, deadline, capacity, waitlist, meal_option) values
    ('年終餐敘', current_date + 30, current_date + 10, 1, 1, true) returning id`)).rows[0].id;
  const 過期 = (await 秘("insert into public.activities (name, date, deadline) values ('已截止活動', current_date + 5, current_date - 1) returning id")).rows[0].id;
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.register_activity($1, '', '')", [活])), "葷食或素食"), "需要選葷素的活動沒選會被擋");
  const r1 = (await 以身分(db, 帳.甲, () => db.query("select public.register_activity($1, '素', '') as s", [活]))).rows[0].s;
  檢查(r1 === "正取", "甲報名（素）→ 正取");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.register_activity($1, '葷', '')", [活])), "已經報名"), "不能重複報名");
  const r2 = (await 以身分(db, 帳.乙, () => db.query("select public.register_activity($1, '葷', '') as s", [活]))).rows[0].s;
  檢查(r2 === "候補", "名額滿了自動列候補");
  檢查(await 應失敗(() => 以身分(db, 帳.秘書長, () => db.query("select public.register_activity($1, '葷', '')", [活])), "額滿"), "名額與候補都滿時擋下");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.register_activity($1, '', '')", [過期])), "截止"), "過了截止日不能報名");
  const 我的報名 = (await 以身分(db, 帳.甲, () => db.query("select id, meal from public.registrations"))).rows;
  檢查(我的報名.length === 1 && 我的報名[0].meal === "素", "會員只看到自己的報名，並記錄葷素");
  檢查(await 應失敗(() => 以身分(db, 帳.乙, () => db.query("select public.cancel_registration($1)", [我的報名[0].id])), "沒有權限"), "不能取消別人的報名");
  await 以身分(db, 帳.甲, () => db.query("select public.cancel_registration($1)", [我的報名[0].id]));
  檢查((await db.query("select status from public.registrations where member_id = (select id from public.members where email = $1)", [帳.乙.email])).rows[0].status === "正取", "正取取消後候補自動遞補");
  const 人數 = (await 以身分(db, 帳.甲, () => db.query("select public.activity_counts() as j"))).rows[0].j.find((x) => x.activity_id === 活);
  檢查(人數 && 人數.confirmed === 1 && 人數.waitlisted === 0 && Object.keys(人數).length === 3, "會員看得到活動報名人數（不含個資）");
  const 統計 = (await 秘("select meal, count(*)::int as n from public.registrations where activity_id = $1 and status <> '取消' group by meal", [活])).rows;
  檢查(統計.length === 1 && 統計[0].meal === "葷", "幹部可統計葷素人數");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("insert into public.registrations (activity_id, member_id) values ($1, $2)", [活, 甲id]))), "會員不能繞過函式直接寫報名表");

  console.log("六、會費");
  const 筆 = (await 秘("select public.record_fees(array(select id from public.members), 2026, '常年會費', 600, current_date, '現金') as n")).rows[0].n;
  檢查(筆 === 3, "幹部一次登記多人繳費");
  檢查((await 秘("select public.record_fees(array[$1::uuid], 2026, '常年會費', 600, current_date, '現金') as n", [甲id])).rows[0].n === 0, "已繳的人不會重複登記");
  const 收據 = (await db.query("select receipt_no from public.fees order by receipt_no")).rows.map((r) => r.receipt_no);
  檢查(收據.join() === "115-0001,115-0002,115-0003", "收據號依民國年流水編號");
  檢查((await 以身分(db, 帳.甲, () => db.query("select count(*)::int as n from public.fees"))).rows[0].n === 1, "會員只看得到自己的繳費紀錄");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.record_fees(array[$1::uuid], 2027, '常年會費', 600, current_date, '現金')", [甲id])), "沒有權限"), "會員不能登記繳費");

  console.log("七、線上入會申請");
  const 申 = (await 以身分(db, 帳.申請人, () => db.query("select public.submit_application('新申請人', '女', '9001', '財政部國庫署', '國庫管理組', '科員', '', '') as id"))).rows[0].id;
  檢查(!!申, "非會員可送出入會申請");
  檢查(await 應失敗(() => 以身分(db, 帳.申請人, () => db.query("select public.submit_application('再送', '', '', '', '', '', '', '')")), "審核中"), "審核中不能重複申請");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.submit_application('甲', '', '', '', '', '', '', '')")), "已經是會員"), "已是會員不能申請");
  檢查((await 以身分(db, 帳.甲, () => db.query("select count(*)::int as n from public.applications"))).rows[0].n === 0, "會員看不到別人的申請");
  檢查(await 應失敗(() => 以身分(db, 帳.申請人, () => db.query("select public.approve_application($1)", [申])), "沒有權限"), "申請人不能自己核准");
  await 秘("select public.approve_application($1)", [申]);
  const 新會員 = (await 以身分(db, 帳.申請人, () => db.query("select name, status, member_no from public.members"))).rows;
  檢查(新會員.length === 1 && 新會員[0].status === "有效" && /^M\d{4}$/.test(新會員[0].member_no), "核准後成為有效會員並自動編會員編號、連結帳號");

  console.log("八、個人 Email 帳號連結：認領碼與連結申請");
  // 名冊上的公務信箱收不到外部信；會員用個人信箱註冊
  const 丁id = (await 秘("insert into public.members (name, agency, email) values ('丁會員', '財政部賦稅署', 'ding@mail.mof.gov.tw') returning id")).rows[0].id;
  const 戊id = (await 秘("insert into public.members (name, agency, email) values ('戊會員', '財政部關務署', 'wu@mail.mof.gov.tw') returning id")).rows[0].id;
  const 新帳 = async (email) => { const u = { id: crypto.randomUUID(), email }; await db.query("insert into auth.users values ($1, $2, now())", [u.id, email]); return u; };
  const 丁帳 = await 新帳("ding.personal@gmail.example"), 戊帳 = await 新帳("wu.personal@gmail.example"), 冒充 = await 新帳("fake@gmail.example");
  檢查((await 以身分(db, 丁帳, () => db.query("select public.link_my_member() as id"))).rows[0].id === null, "個人 Email 與名冊不同時，不會自動連結");
  檢查(await 應失敗(() => 以身分(db, 丁帳, () => db.query("select * from public.generate_claim_codes(array[$1::uuid])", [丁id])), "沒有權限"), "會員不能自己產生認領碼");
  const 碼們 = (await 秘("select * from public.generate_claim_codes(array[$1::uuid, $2::uuid, $3::uuid])", [丁id, 戊id, 甲id])).rows;
  檢查(碼們.length === 2 && 碼們.every((c) => /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(c.code)), "幹部產生認領碼（已連結帳號的人略過，格式 XXXXX-XXXXX）");
  檢查(await 應失敗(() => 以身分(db, 丁帳, () => db.query("select count(*)::int as n from public.claim_codes"))), "會員不能讀認領碼表");
  const 丁碼 = 碼們.find((c) => c.member_id === 丁id).code;
  檢查(await 應失敗(() => 以身分(db, 冒充, () => db.query("select public.claim_with_code('ABCDE-FGHJK')")), "不正確"), "亂猜的認領碼無效");
  await 以身分(db, 丁帳, () => db.query("select public.claim_with_code($1)", [丁碼.toLowerCase().replace("-", " ")]));
  檢查((await 以身分(db, 丁帳, () => db.query("select name from public.members"))).rows.map((r) => r.name).join() === "丁會員", "輸入認領碼（大小寫、空格不拘）後連結成功，只看得到自己");
  檢查(await 應失敗(() => 以身分(db, 冒充, () => db.query("select public.claim_with_code($1)", [丁碼])), "不正確"), "認領碼用過即作廢");
  await db.query("update public.claim_codes set expires_at = now() - interval '1 day' where member_id = $1", [戊id]);
  檢查(await 應失敗(() => 以身分(db, 戊帳, () => db.query("select public.claim_with_code($1)", [碼們.find((c) => c.member_id === 戊id).code])), "過期"), "過期的認領碼無效");
  // 沒有認領碼：送連結申請，幹部核准
  const 申請id = (await 以身分(db, 戊帳, () => db.query("select public.submit_link_request('戊會員', '財政部關務署', '稽查組', '科員', 'wu@mail.mof.gov.tw', '', '') as id"))).rows[0].id;
  檢查(await 應失敗(() => 以身分(db, 戊帳, () => db.query("select public.submit_link_request('戊會員', '', '', '', '', '', '')")), "審核中"), "連結申請審核中不能重複送");
  檢查((await 以身分(db, 冒充, () => db.query("select count(*)::int as n from public.link_requests"))).rows[0].n === 0, "其他人看不到別人的連結申請");
  檢查(await 應失敗(() => 以身分(db, 戊帳, () => db.query("select public.approve_link_request($1, $2)", [申請id, 戊id])), "沒有權限"), "申請人不能自己核准連結");
  檢查(await 應失敗(() => 秘("select public.approve_link_request($1, $2)", [申請id, 丁id]), "已連結"), "不能把申請連到已有帳號的會員");
  await 秘("select public.approve_link_request($1, $2)", [申請id, 戊id]);
  檢查((await 以身分(db, 戊帳, () => db.query("select name, email from public.members"))).rows.map((r) => r.name + r.email).join() === "戊會員wu@mail.mof.gov.tw", "幹部核准後連結成功，名冊公務信箱不變");
  檢查((await db.query("select count(*)::int as n from public.claim_codes where member_id = $1", [戊id])).rows[0].n === 0, "核准連結後舊認領碼作廢");
  檢查(await 應失敗(() => 以身分(db, 丁帳, () => db.query("select public.unlink_member($1)", [丁id])), "只有理事長"), "一般會員不能解除連結");
  await 秘("select public.unlink_member($1)", [丁id]);
  檢查((await 以身分(db, 丁帳, () => db.query("select count(*)::int as n from public.members"))).rows[0].n === 0, "秘書長解除連結後，該帳號看不到會員資料");
  // 入會申請可填公務信箱
  const 己帳 = await 新帳("ji.personal@gmail.example");
  const 己申 = (await 以身分(db, 己帳, () => db.query("select public.submit_application('己同仁', '男', '', '財政部國庫署', '', '', '', '', 'JI@mail.mof.gov.tw') as id"))).rows[0].id;
  await 秘("select public.approve_application($1)", [己申]);
  檢查((await 以身分(db, 己帳, () => db.query("select email from public.members"))).rows[0].email === "ji@mail.mof.gov.tw", "入會申請填的公務信箱寫入名冊，帳號用個人信箱登入");

  // 第一位幹部用個人信箱登入、名冊用公務信箱
  const 庚帳 = await 新帳("geng.personal@gmail.example");
  await 秘("insert into public.members (name, email) values ('庚理事長', 'geng@mail.mof.gov.tw')");
  console.log("  " + (await db.query("select public.make_staff('geng.personal@gmail.example', '理事長', '', 'geng@mail.mof.gov.tw') as r")).rows[0].r);
  const 庚 = (await 以身分(db, 庚帳, () => db.query("select name, email, staff_role from public.members where user_id = auth.uid()"))).rows[0];
  檢查(庚 && 庚.name === "庚理事長" && 庚.email === "geng@mail.mof.gov.tw" && 庚.staff_role === "理事長", "make_staff 可用個人登入信箱＋名冊公務信箱設定幹部（不重複建立）");

  檢查(await 應失敗(() => db.query("select public.make_staff('x@gmail.example', '會長', 'X')"), "角色只能是"), "make_staff 填錯角色會清楚提示");
  const 辛帳 = await 新帳("xin.personal@gmail.example");
  await db.query("select public.make_staff('xin.personal@gmail.example', '總幹事', '辛總幹事', 'xin@fia.example.gov')");
  await 以身分(db, 辛帳, () => db.query("update public.members set staff_role = '承辦人' where email = 'geng@mail.mof.gov.tw'"));
  檢查((await db.query("select staff_role from public.members where email = 'geng@mail.mof.gov.tw'")).rows[0].staff_role === "承辦人", "總幹事可以指派幹部角色");

  // 先送了連結申請、之後被 make_staff（或認領碼）連結：待審申請自動結案
  const 壬帳 = await 新帳("ren.personal@gmail.example");
  await 以身分(db, 壬帳, () => db.query("select public.submit_link_request('壬總幹事', '財政部賦稅署', '', '', 'ren@fia.example.gov', '', '')"));
  await 以身分(db, 壬帳, () => db.query("select public.submit_application('壬總幹事', '', '', '財政部賦稅署', '', '', '', '', 'ren@fia.example.gov')"));
  await db.query("select public.make_staff('ren.personal@gmail.example', '總幹事', '壬總幹事', 'ren@fia.example.gov')");
  const 壬申 = (await db.query("select (select status from public.link_requests where login_email = 'ren.personal@gmail.example') as l, (select status from public.applications where user_id = $1) as a", [壬帳.id])).rows[0];
  檢查(壬申.l === "核准" && 壬申.a === "核准", "帳號被 make_staff 連結後，原本待審的連結申請與入會申請自動結案");
  const 壬 = (await 以身分(db, 壬帳, () => db.query("select staff_role from public.members where user_id = auth.uid()"))).rows[0];
  檢查(壬 && 壬.staff_role === "總幹事", "先註冊、送過申請的人，執行 make_staff 後成為總幹事");
  // 認領碼路徑也會結案
  const 癸id = (await 秘("insert into public.members (name, email) values ('癸會員', 'gui@fia.example.gov') returning id")).rows[0].id;
  const 癸帳 = await 新帳("gui.personal@gmail.example");
  await 以身分(db, 癸帳, () => db.query("select public.submit_link_request('癸會員', '', '', '', '', '', '')"));
  const 癸碼 = (await 秘("select code from public.generate_claim_codes(array[$1::uuid])", [癸id])).rows[0].code;
  await 以身分(db, 癸帳, () => db.query("select public.claim_with_code($1)", [癸碼]));
  檢查((await db.query("select status from public.link_requests where user_id = $1", [癸帳.id])).rows[0].status === "核准", "用認領碼連結後，原本待審的連結申請也自動結案");

  console.log("九、未登入者");
  for (const 表 of ["members", "activities", "registrations", "fees", "applications", "claim_codes", "link_requests"]) {
    檢查(await 應失敗(() => 以身分(db, null, () => db.query("select * from public." + 表))), "未登入者不能讀 " + 表);
  }
  檢查(await 應失敗(() => 以身分(db, null, () => db.query("select public.register_activity($1, '葷', '')", [活]))), "未登入者不能呼叫報名函式");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.make_staff('x@example.org', '秘書長')"))), "登入者不能呼叫 make_staff（只能在 SQL Editor 用）");

  console.log("十、資安強化（審查發現的問題）");
  {
    const 新 = async (email) => { const u = { id: crypto.randomUUID(), email }; await db.query("insert into auth.users values ($1, $2, now())", [u.id, email]); return u; };
    const 長帳 = await 新("chair@gmail.example"), 辦帳 = await 新("clerk@gmail.example"), 分身 = await 新("clerk.alt@gmail.example"), 預建帳 = await 新("pre@gmail.example");
    await db.query("select public.make_staff('chair@gmail.example', '理事長', '測試理事長', 'chair@fia.example.gov')");
    await db.query("select public.make_staff('clerk@gmail.example', '承辦人', '測試承辦人', 'clerk@fia.example.gov')");
    const 長列 = (await db.query("select id from public.members where email = 'chair@fia.example.gov'")).rows[0].id;
    const 辦 = (sql, p) => 以身分(db, 辦帳, () => db.query(sql, p));
    // 1. 幹部不能直接改帳號連結
    檢查(await 應失敗(() => 辦("update public.members set user_id = $1 where id = $2", [分身.id, 長列])), "承辦人不能把理事長那筆改連到自己的分身帳號");
    檢查(await 應失敗(() => 辦("update public.members set user_id = null where id = $1", [長列])), "承辦人不能直接解除別人的帳號連結");
    檢查(await 應失敗(() => 辦("insert into public.members (name, user_id) values ('偷連', $1)", [分身.id])), "承辦人新增會員時不能指定帳號連結");
    檢查(await 應失敗(() => 辦("update public.members set status = '停權' where id = $1", [長列]), "只有理事長"), "承辦人不能把理事長停權");
    檢查(await 應失敗(() => 辦("update public.members set email = 'x@gmail.example' where id = $1", [長列]), "只有理事長"), "承辦人不能改幹部的 Email");
    檢查((await 以身分(db, 長帳, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "理事長", "上述攻擊後理事長權限不變");
    const 一般列 = (await db.query("insert into public.members (name, email) values ('一般會員丙', 'bing3@fia.example.gov') returning id")).rows[0].id;
    await 辦("update public.members set phone = '分機 9', status = '停權' where id = $1", [一般列]);
    檢查((await db.query("select phone, status from public.members where id = $1", [一般列])).rows[0].status === "停權", "承辦人仍可正常編輯一般會員（電話、會籍）");
    // 2. 預先建立、尚未連結的幹部列：非管理者不能替它發認領碼或核准連結
    await db.query("insert into public.members (name, email, staff_role) values ('預建秘書長', 'pre@fia.example.gov', '秘書長')");
    const 預建列 = (await db.query("select id from public.members where email = 'pre@fia.example.gov'")).rows[0].id;
    檢查((await 辦("select * from public.generate_claim_codes(array[$1::uuid])", [預建列])).rows.length === 0, "承辦人不能替未連結的幹部列產生認領碼");
    const 分身申請 = (await 以身分(db, 分身, () => db.query("select public.submit_link_request('預建秘書長', '', '', '', 'pre@fia.example.gov', '', '') as id"))).rows[0].id;
    檢查(await 應失敗(() => 辦("select public.approve_link_request($1, $2)", [分身申請, 預建列]), "只有理事長"), "承辦人不能把連結申請核准到幹部列");
    const 長發碼 = (await 以身分(db, 長帳, () => db.query("select * from public.generate_claim_codes(array[$1::uuid])", [預建列]))).rows;
    檢查(長發碼.length === 1, "理事長可以替未連結的幹部列產生認領碼");
    // 2b. 認領碼表：幹部也不能直接讀；資料庫只存雜湊值
    檢查(await 應失敗(() => 辦("select * from public.claim_codes")), "承辦人不能直接讀認領碼表（看不到理事長替幹部列發的碼）");
    const 欄們 = (await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'claim_codes'")).rows.map((r) => r.column_name);
    檢查(!欄們.includes("code") && (await db.query("select count(*)::int as n from public.claim_codes where code_hash = public.claim_code_hash($1)", [長發碼[0].code])).rows[0].n === 1, "認領碼只存雜湊值，不存明碼");
    檢查(await 應失敗(() => 辦("select public.claim_code_hash('AAAAA-BBBBB')")), "登入者不能直接呼叫雜湊函式");
    // 2c. 承辦人發給一般會員的碼，該會員之後被設為幹部 → 舊碼作廢
    const 升任列 = (await db.query("insert into public.members (name, email) values ('將升任', 'promote@fia.example.gov') returning id")).rows[0].id;
    const 升任碼 = (await 辦("select code from public.generate_claim_codes(array[$1::uuid])", [升任列])).rows[0].code;
    await 以身分(db, 長帳, () => db.query("update public.members set staff_role = '總幹事' where id = $1", [升任列]));
    檢查(await 應失敗(() => 以身分(db, 分身, () => db.query("select public.claim_with_code($1)", [升任碼])), "不正確"), "一般會員升任幹部後，承辦人先前發的認領碼作廢");
    檢查((await db.query("select user_id from public.members where id = $1", [升任列])).rows[0].user_id === null, "上述被拒後，幹部列仍未被連走");
    // 2d. 非管理者發的碼即使留在表裡（例如舊版遺留），也不能認領幹部列
    await db.query("insert into public.claim_codes (member_id, code_hash, by_admin) values ($1, public.claim_code_hash('AAAAA-BBBBB'), false)", [升任列]);
    檢查(await 應失敗(() => 以身分(db, 分身, () => db.query("select public.claim_with_code('AAAAA-BBBBB')")), "不能用於幹部"), "非管理者發的認領碼不能認領幹部列");
    // 2e. make_staff 連結後再解除連結：之前發的碼不會復活
    const 換人列 = (await db.query("insert into public.members (name, email) values ('換信箱幹部', 'swap@fia.example.gov') returning id")).rows[0].id;
    const 換人碼 = (await 辦("select code from public.generate_claim_codes(array[$1::uuid])", [換人列])).rows[0].code;
    await 新("swap@gmail.example");
    await db.query("select public.make_staff('swap@gmail.example', '會計', '', 'swap@fia.example.gov')");
    await 以身分(db, 長帳, () => db.query("select public.unlink_member($1)", [換人列]));
    檢查(await 應失敗(() => 以身分(db, 分身, () => db.query("select public.claim_with_code($1)", [換人碼])), "不正確"), "make_staff 連結→解除連結後，舊認領碼不能再用");
    // 2f. 管理者替幹部列發的碼，本人可以正常認領
    await 以身分(db, 預建帳, () => db.query("select public.claim_with_code($1)", [長發碼[0].code]));
    檢查((await 以身分(db, 預建帳, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "秘書長", "理事長替幹部列發的認領碼，本人認領後取得該角色");
    // 2g. 承辦人先把分身連到一般會員（自己發碼或核准連結申請），之後理事長指派幹部角色 → 擋下
    const 將任甲 = (await db.query("insert into public.members (name, email) values ('將任甲', 'future1@fia.example.gov') returning id")).rows[0].id;
    const 將任乙 = (await db.query("insert into public.members (name, email) values ('將任乙', 'future2@fia.example.gov') returning id")).rows[0].id;
    const 分身2 = await 新("clerk.alt2@gmail.example"), 分身3 = await 新("clerk.alt3@gmail.example");
    const 甲碼 = (await 辦("select code from public.generate_claim_codes(array[$1::uuid])", [將任甲])).rows[0].code;
    await 以身分(db, 分身2, () => db.query("select public.claim_with_code($1)", [甲碼]));
    const 乙申 = (await 以身分(db, 分身3, () => db.query("select public.submit_link_request('將任乙', '', '', '', '', '', '') as id"))).rows[0].id;
    await 辦("select public.approve_link_request($1, $2)", [乙申, 將任乙]);
    const 長 = (sql, p) => 以身分(db, 長帳, () => db.query(sql, p));
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [將任甲]), "不是由理事長"), "承辦人發碼連結的會員，理事長不能直接指派幹部角色（防分身奪權）");
    檢查(await 應失敗(() => 長("update public.members set staff_role = '總幹事' where id = $1", [將任乙]), "不是由理事長"), "承辦人核准連結的會員，理事長不能直接指派幹部角色");
    檢查((await 以身分(db, 分身2, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "", "上述被擋後，分身帳號仍不是幹部");
    // 正確做法：解除連結 → 管理者發碼 → 本人認領 → 指派
    await 長("select public.unlink_member($1)", [將任甲]);
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [將任甲])).rows[0].linked_by_admin === false, "解除連結後「管理者連結」標記歸零");
    const 本人 = await 新("future1.self@gmail.example");
    const 管碼 = (await 長("select code from public.generate_claim_codes(array[$1::uuid])", [將任甲])).rows[0].code;
    await 以身分(db, 本人, () => db.query("select public.claim_with_code($1)", [管碼]));
    await 長("update public.members set staff_role = '秘書長' where id = $1", [將任甲]);
    檢查((await 以身分(db, 本人, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "秘書長", "管理者發碼連結的會員可以指派幹部角色");
    檢查(!(await db.query("select has_column_privilege('authenticated', 'public.members', 'linked_by_admin', 'UPDATE') or has_column_privilege('authenticated', 'public.members', 'linked_by_admin', 'INSERT') as ok")).rows[0].ok, "登入者不能直接改「管理者連結」標記");
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [長列])).rows[0].linked_by_admin === true, "make_staff 連結的帳號標記為管理者連結");
    // 2h. 管理者核准分身的入會申請後，承辦人把那筆改成「將升任的人」的姓名、Email、員工編號 → 不再算管理者連結，指派被擋
    const 分身4 = await 新("clerk.alt4@gmail.example");
    const 分身申 = (await 以身分(db, 分身4, () => db.query("select public.submit_application('林新人', '', '', '財政部國庫署', '', '', '', '', 'newbie4@fia.example.gov') as id"))).rows[0].id;
    const R列 = (await 長("select public.approve_application($1) as id", [分身申])).rows[0].id;
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [R列])).rows[0].linked_by_admin === true, "理事長核准的入會申請，帳號連結標記為管理者連結");
    await 辦("update public.members set name = '王未來', email = 'future@fia.example.gov', employee_no = 'E123' where id = $1", [R列]);
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [R列])).rows[0].linked_by_admin === false, "承辦人改了已連結那筆的姓名、Email、員工編號後，不再算管理者連結");
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [R列]), "不是由理事長"), "理事長指派那筆為幹部時被擋（防止改名冒充後奪權）");
    檢查((await 以身分(db, 分身4, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "", "上述被擋後，分身帳號仍不是幹部");
    await 以身分(db, 分身4, () => db.query("select public.update_my_profile('男', '財政部國庫署', '國庫組', '科員', '分機 1')"));
    // 2i. 已是幹部的會計把自己那筆改成將升任者的姓名、員工編號 → 理事長把那筆從會計改成秘書長時被擋
    const 計帳 = await 新("acct@gmail.example");
    await db.query("select public.make_staff('acct@gmail.example', '會計', '測試會計', 'acct@fia.example.gov')");
    const 計列 = (await db.query("select id from public.members where email = 'acct@fia.example.gov'")).rows[0].id;
    await 以身分(db, 計帳, () => db.query("update public.members set name = '王將任', employee_no = 'E777' where id = $1", [計列]));
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [計列]), "不是由理事長"), "會計改了自己那筆的姓名、員工編號後，不能被直接改指派為秘書長");
    await 長("update public.members set staff_role = '' where id = $1", [計列]);
    檢查((await db.query("select staff_role from public.members where id = $1", [計列])).rows[0].staff_role === "", "取消幹部角色不受影響");
    // 管理者可以看登入帳號（個人 Email）核對；其他人不行
    檢查((await 長("select public.member_login_email($1) as e", [R列])).rows[0].e === "clerk.alt4@gmail.example", "管理者看得到某位會員連結的登入帳號");
    檢查(await 應失敗(() => 辦("select public.member_login_email($1)", [R列]), "只有理事長"), "承辦人不能查登入帳號");
    // 3. 入會申請不依自填信箱連到既有會員
    const 冒用 = await 新("fake.applicant@gmail.example");
    const 冒申 = (await 以身分(db, 冒用, () => db.query("select public.submit_application('新人張三', '', '', '財政部賦稅署', '', '', '', '', 'bing3@fia.example.gov') as id"))).rows[0].id;
    檢查(await 應失敗(() => 辦("select public.approve_application($1)", [冒申]), "名冊已有公務信箱"), "入會申請填了名冊上已有的公務信箱時，核准會被擋下並提示改走帳號連結");
    檢查((await db.query("select user_id, status from public.members where id = $1", [一般列])).rows[0].user_id === null, "被冒用信箱的會員資料沒有被連走");
    const 正常申 = (await 以身分(db, await 新("newcomer@gmail.example"), () => db.query("select public.submit_application('新進丁', '', '', '財政部國庫署', '', '', '', '', 'ding4@fia.example.gov') as id"))).rows[0].id;
    await 辦("select public.approve_application($1)", [正常申]);
    const 備註 = (await db.query("select review_note from public.applications where id = $1", [正常申])).rows[0].review_note;
    檢查(/^新建會員 M\d{4}$/.test(備註), "核准入會的審核備註記錄新建的會員編號（" + 備註 + "）");
    // 4. make_staff 的防呆
    檢查(await 應失敗(() => db.query("select public.make_staff('nobody@gmail.example', '秘書長', 'X', 'nobody@fia.example.gov')"), "還沒有註冊"), "make_staff：登入 Email 還沒註冊時拒絕，不先建立未連結的幹部列");
    const 換信箱 = await 新("chair.new@gmail.example");
    檢查(await 應失敗(() => db.query("select public.make_staff('chair.new@gmail.example', '秘書長', '', 'chair@fia.example.gov')"), "已連結另一個登入帳號"), "make_staff：名冊那筆已連到別的帳號時拒絕，並說明怎麼處理");
    檢查((await db.query("select staff_role from public.members where id = $1", [長列])).rows[0].staff_role === "理事長", "上述被拒後，原本的角色不變");
    // 5. 代為報名走 staff_register，名額由資料庫判斷
    const 活 = (await db.query("insert into public.activities (name, date, capacity, waitlist) values ('名額測試', current_date + 5, 1, 0) returning id")).rows[0].id;
    檢查(await 應失敗(() => 辦("insert into public.registrations (activity_id, member_id) values ($1, $2)", [活, 一般列])), "幹部不能繞過名額檢查直接新增報名");
    const 人們 = (await db.query("select id from public.members where status = '有效' limit 2")).rows.map((r) => r.id);
    檢查((await 辦("select public.staff_register($1, $2, '', '') as s", [活, 人們[0]])).rows[0].s === "正取", "staff_register 代為報名（正取）");
    檢查(await 應失敗(() => 辦("select public.staff_register($1, $2, '', '')", [活, 人們[1]]), "額滿"), "staff_register 名額已滿時擋下（不會超收）");
    // 6. 同一筆報名取消兩次：第二次被拒、不會再遞補
    const 活2 = (await db.query("insert into public.activities (name, date, capacity, waitlist) values ('取消測試', current_date + 5, 1, 2) returning id")).rows[0].id;
    const 三人 = (await db.query("select id from public.members where status = '有效' limit 3")).rows.map((r) => r.id);
    for (const 人 of 三人) await 辦("select public.staff_register($1, $2, '', '')", [活2, 人]);
    const 正取報名 = (await db.query("select id from public.registrations where activity_id = $1 and status = '正取'", [活2])).rows[0].id;
    await 辦("select public.cancel_registration($1)", [正取報名]);
    檢查(await 應失敗(() => 辦("select public.cancel_registration($1)", [正取報名]), "找不到可以取消"), "同一筆報名第二次取消被拒");
    檢查((await db.query("select count(*)::int as n from public.registrations where activity_id = $1 and status = '正取'", [活2])).rows[0].n === 1, "取消後只遞補一位，正取不超過名額");
    // 7. Supabase 預設權限下，未登入者不能執行任何函式、不能寫任何資料表
    const 函式們 = (await db.query("select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")).rows.map((r) => r.f);
    const anon可執行 = [];
    for (const f of 函式們) if ((await db.query("select has_function_privilege('anon', $1, 'execute') as ok", [f])).rows[0].ok) anon可執行.push(f);
    檢查(anon可執行.length === 0, "未登入者（anon）不能執行任何函式" + (anon可執行.length ? "（" + anon可執行.join("、") + "）" : ""));
    const 表們 = ["members", "activities", "registrations", "fees", "applications", "claim_codes", "link_requests"];
    const anon可寫 = [];
    for (const t of 表們) for (const 權 of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) if ((await db.query("select has_table_privilege('anon', $1, $2) as ok", ["public." + t, 權])).rows[0].ok) anon可寫.push(t + ":" + 權);
    檢查(anon可寫.length === 0, "未登入者（anon）對資料表沒有任何權限" + (anon可寫.length ? "（" + anon可寫.join("、") + "）" : ""));
    const 登入可截斷 = [];
    for (const t of 表們) if ((await db.query("select has_table_privilege('authenticated', $1, 'TRUNCATE') as ok", ["public." + t])).rows[0].ok) 登入可截斷.push(t);
    檢查(登入可截斷.length === 0, "登入者不能 TRUNCATE 任何資料表");
    const 可改連結 = (await db.query("select has_column_privilege('authenticated', 'public.members', 'user_id', 'UPDATE') or has_column_privilege('authenticated', 'public.members', 'user_id', 'INSERT') as ok")).rows[0].ok;
    檢查(!可改連結, "登入者對 members.user_id 沒有直接寫入權限");
    // 8. 整份結構重新執行一次（模擬程式更新），權限仍正確
    await db.exec(fs.readFileSync(path.join(根目錄, "線上系統", "資料庫結構.sql"), "utf8"));
    檢查(await 應失敗(() => 辦("update public.members set user_id = $1 where id = $2", [分身.id, 長列])), "重新執行結構後，幹部仍不能改帳號連結");
  }

  console.log("\n資料庫測試：通過 " + 通過 + " 項，失敗 " + 失敗.length + " 項");
  失敗.forEach((f) => console.log("  ✘ " + f));
  process.exit(失敗.length ? 1 : 0);
}
