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
  try { return await 動作(); } finally { await db.exec("reset role"); }
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
  檢查((await 以身分(db, 帳.未驗證, () => db.query("select public.link_my_member() as id"))).rows[0].id === null, "Email 未驗證的帳號不能認領會員資料");
  const 甲id = (await 以身分(db, 帳.甲, () => db.query("select public.link_my_member() as id"))).rows[0].id;
  檢查(!!甲id, "會員登入後依已驗證 Email 自動連結到名冊（大小寫不拘）");
  await 以身分(db, 帳.乙, () => db.query("select public.link_my_member()"));
  await 以身分(db, 帳.秘書長, () => db.query("select public.link_my_member()"));

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
  檢查(await 應失敗(() => 以身分(db, 帳.乙, () => db.query("update public.members set staff_role = '秘書長' where email = $1", [帳.乙.email])), "只有理事長或秘書長"), "承辦人不能把自己升為秘書長");
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

  console.log("八、未登入者");
  for (const 表 of ["members", "activities", "registrations", "fees", "applications"]) {
    檢查(await 應失敗(() => 以身分(db, null, () => db.query("select * from public." + 表))), "未登入者不能讀 " + 表);
  }
  檢查(await 應失敗(() => 以身分(db, null, () => db.query("select public.register_activity($1, '葷', '')", [活]))), "未登入者不能呼叫報名函式");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.make_staff('x@example.org', '秘書長')"))), "登入者不能呼叫 make_staff（只能在 SQL Editor 用）");

  console.log("\n資料庫測試：通過 " + 通過 + " 項，失敗 " + 失敗.length + " 項");
  失敗.forEach((f) => console.log("  ✘ " + f));
  process.exit(失敗.length ? 1 : 0);
}
