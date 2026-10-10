// 線上會員系統資料庫測試：用 PGlite（瀏覽器版 Postgres）執行 線上系統/資料庫結構.sql，
// 模擬 Supabase 的 auth（登入者），逐項檢查權限（RLS）與函式行為
// 用法：node 製作/test/資料庫測試.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const 根目錄 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// 模擬 Supabase 內建的 auth 結構與角色（正式環境由 Supabase 提供）
export const 模擬auth = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema extensions;
-- 欄位比照 Supabase 的 auth.users（只列出用得到的）；前三欄的順序不要改（測試直接依序插入）
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz,
  instance_id uuid, aud text, role text, encrypted_password text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null, identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, email text generated always as (lower(identity_data ->> 'email')) stored,
  unique (provider_id, provider));
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade, created_at timestamptz default now());
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
  const db = new PGlite({ extensions: { pgcrypto } });
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
  // 甲、乙註冊了但還沒收到驗證信（未驗證）：秘書長直接替他們建立（接管）帳號
  for (const [名, 驗證] of [["秘書長", true], ["承辦人", true], ["甲", false], ["乙", false], ["申請人", true], ["未驗證", false]]) {
    帳[名] = { id: crypto.randomUUID(), email: 名 === "未驗證" ? "unverified@example.org" : "u" + Object.keys(帳).length + "@example.org" };
    await db.query("insert into auth.users values ($1, $2, $3)", [帳[名].id, 帳[名].email, 驗證 ? new Date().toISOString() : null]);
  }
  帳.甲.email = "jia@example.org"; await db.query("update auth.users set email = $1 where id = $2", ["jia@example.org", 帳.甲.id]);

  console.log("一、第一次設定與帳號連結");
  console.log("  " + (await db.query("select public.make_staff($1, '秘書長', '陳秘書') as r", [帳.秘書長.email])).rows[0].r);
  // 名冊先有甲、乙（例如從 Excel 匯入），尚未連結帳號
  await db.query(`insert into public.members (name, gender, agency, unit, title, email) values
    ('甲會員', '女', '財政部賦稅署', '稅制組', '科員', 'JIA@example.org'), ('乙會員', '男', '財政部關務署', '稽查組', '專員', $1)`, [帳.乙.email]);
  檢查((await 以身分(db, 帳.未驗證, () => db.query("select public.link_my_member() as id"))).rows[0].id === null, "Email 未驗證的帳號不會連結");
  檢查((await 以身分(db, 帳.甲, () => db.query("select public.link_my_member() as id"))).rows[0].id === null, "Email 與名冊相同、已驗證也不會自動連結（避免冒用公務信箱）");
  // 秘書長替甲、乙「建立登入帳號」：兩人已註冊過，直接改成秘書長設定的密碼並連結
  for (const [名, 信箱] of [["甲", "jia@example.org"], ["乙", 帳.乙.email]]) {
    const r = (await 以身分(db, 帳.秘書長, () => db.query("select public.create_member_login((select id from public.members where email = $1), $2, 'pass12345') as r", [信箱.toLowerCase() === "jia@example.org" ? "jia@example.org" : 信箱, 帳[名].email]))).rows[0].r;
    檢查(r === "已存在", "建立登入帳號：Email 已註冊但未驗證時直接接管（" + 名 + "）");
  }
  檢查((await db.query("select count(*)::int as n from auth.users where id = $1 and encrypted_password = extensions.crypt('pass12345', encrypted_password)", [帳.甲.id])).rows[0].n === 1, "接管後密碼改成秘書長設定的（bcrypt 雜湊，不存明碼）");
  const 甲id = (await 以身分(db, 帳.甲, () => db.query("select public.link_my_member() as id"))).rows[0].id;
  檢查(!!甲id, "建立登入帳號後，link_my_member 回傳自己的會員資料");

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
  await 秘("update public.members set board_role = '監事', board_title = '常務理事' where id = $1", [甲id]);
  檢查((await db.query("select board_role from public.members where id = $1", [甲id])).rows[0].board_role === "理事", "理事或監事由職稱決定（常務理事一定是理事；理事與監事互斥）");
  檢查(await 應失敗(() => 秘("update public.members set board_title = '會長' where id = $1", [甲id]), "沒有「會長」這個理監事職稱"), "不在系統設定清單裡的職稱會被擋下");
  await 秘("update public.members set board_role = '監事', board_title = '' where id = $1", [甲id]);
  const 甲3 = (await db.query("select board_role, board_title, is_representative from public.members where id = $1", [甲id])).rows[0];
  檢查(甲3.board_role === "監事" && 甲3.board_title === "監事" && 甲3.is_representative, "改成監事後就不再是理事（同一欄位只能擇一），會員代表仍保留");

  console.log("四、幹部角色");
  await 秘("update public.members set staff_role = '承辦人' where email = $1", [帳.乙.email]);
  檢查((await 以身分(db, 帳.乙, () => db.query("select count(*)::int as n from public.members"))).rows[0].n === 3, "承辦人可看到全部名冊");
  檢查(await 應失敗(() => 以身分(db, 帳.乙, () => db.query("update public.members set staff_role = '秘書長' where email = $1", [帳.乙.email])), "只有具管理權限"), "承辦人不能把自己升為秘書長");
  檢查(await 應失敗(() => 秘("update public.members set staff_role = '會長' where email = $1", [帳.乙.email]), "沒有「會長」這個幹部角色"), "不在系統設定清單裡的幹部角色會被擋下");
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

  console.log("八、管理者建立登入帳號；會員自己註冊後送連結申請");
  const 丁id = (await 秘("insert into public.members (name, agency, email) values ('丁會員', '財政部賦稅署', 'ding@mail.mof.gov.tw') returning id")).rows[0].id;
  const 戊id = (await 秘("insert into public.members (name, agency, email) values ('戊會員', '財政部關務署', 'wu@mail.mof.gov.tw') returning id")).rows[0].id;
  const 新帳 = async (email, 已驗證 = true) => { const u = { id: crypto.randomUUID(), email }; await db.query("insert into auth.users values ($1, $2, $3)", [u.id, email, 已驗證 ? new Date().toISOString() : null]); return u; };
  const 戊帳 = await 新帳("wu.personal@gmail.example"), 冒充 = await 新帳("fake@gmail.example");
  // 收不到信的假帳號：管理者直接建立，不用收驗證信
  const 測id = (await 秘("insert into public.members (name, agency, email) values ('測試帳號', '財政部（部本部）', 'moftest@mof.gov.tw') returning id")).rows[0].id;
  檢查((await 秘("select public.create_member_login($1, 'MofTest@mof.gov.tw', 'test1234') as r", [測id])).rows[0].r === "已建立", "管理者替會員建立新的登入帳號（例如收不到信的 moftest@mof.gov.tw）");
  const 測帳 = (await db.query("select id, email, email_confirmed_at is not null as 已驗證, encrypted_password = extensions.crypt('test1234', encrypted_password) as 密碼對, encrypted_password like '$2%' as bcrypt, aud, role from auth.users where email = 'moftest@mof.gov.tw'")).rows[0];
  檢查(測帳 && 測帳.已驗證 && 測帳.密碼對 && 測帳.bcrypt && 測帳.aud === "authenticated" && 測帳.role === "authenticated", "新帳號已驗證、密碼以 bcrypt 雜湊儲存，Email 統一小寫");
  檢查((await db.query("select count(*)::int as n from auth.identities where user_id = $1 and provider = 'email' and provider_id = $1::text and identity_data ->> 'email' = 'moftest@mof.gov.tw'", [測帳.id])).rows[0].n === 1, "同時建立 Email 登入身分（identities）");
  檢查((await 以身分(db, 測帳, () => db.query("select name from public.members"))).rows.map((r) => r.name).join() === "測試帳號", "用新帳號登入就看得到自己的會員資料");
  檢查((await db.query("select linked_by_admin from public.members where id = $1", [測id])).rows[0].linked_by_admin === true, "管理者建立的帳號標記為管理者連結");
  // 已註冊但收不到驗證信（未驗證）的帳號：建立時直接完成驗證
  const 丁帳 = await 新帳("ding.personal@gmail.example", false);
  檢查((await 秘("select public.create_member_login($1, 'ding.personal@gmail.example', 'dingpass1') as r", [丁id])).rows[0].r === "已存在", "Email 已註冊但未驗證：直接接管");
  檢查((await db.query("select email_confirmed_at is not null as ok from auth.users where id = $1", [丁帳.id])).rows[0].ok, "接管時直接完成 Email 驗證");
  檢查((await 以身分(db, 丁帳, () => db.query("select name from public.members"))).rows.map((r) => r.name).join() === "丁會員", "接管後丁看得到自己的會員資料");
  // 防呆與權限
  檢查(await 應失敗(() => 以身分(db, 丁帳, () => db.query("select public.create_member_login($1, 'x@gmail.example', 'abcd1234')", [戊id])), "只有具管理權限"), "一般會員不能建立登入帳號");
  檢查(await 應失敗(() => 秘("select public.create_member_login($1, 'x@gmail.example', 'ab')", [戊id]), "至少 3 個字元"), "密碼太短（少於 3 個字元）被擋");
  檢查(await 應失敗(() => 秘("select public.create_member_login($1, 'not-an-email', 'abcd1234')", [戊id]), "格式不正確"), "Email 格式不對被擋");
  檢查(await 應失敗(() => 秘("select public.create_member_login($1, 'y@gmail.example', 'abcd1234')", [丁id]), "已經有登入帳號"), "已有帳號的會員不能再建立");
  檢查(await 應失敗(() => 秘("select public.create_member_login($1, 'ding.personal@gmail.example', 'abcd1234')", [戊id]), "已經是名冊上「丁會員」的登入帳號"), "已連結別人的 Email 不能拿來建立");
  // 已註冊並驗證的帳號不能接管（避免改掉別人正在用的密碼）：請本人送連結申請
  檢查(await 應失敗(() => 秘("select public.create_member_login($1, 'wu.personal@gmail.example', 'abcd1234')", [戊id]), "已經有人註冊並完成驗證"), "已驗證的帳號不能被「建立登入帳號」接管");
  // 管理者重設密碼：原本的登入工作階段全部失效
  await db.query("insert into auth.sessions (user_id) values ($1), ($1)", [丁帳.id]);
  await 秘("select public.set_member_password($1, 'newding99')", [丁id]);
  檢查((await db.query("select count(*)::int as n from auth.sessions where user_id = $1", [丁帳.id])).rows[0].n === 0, "重設密碼後，這個帳號原本的登入全部失效");
  檢查((await db.query("select encrypted_password = extensions.crypt('newding99', encrypted_password) as ok from auth.users where id = $1", [丁帳.id])).rows[0].ok, "管理者可替會員重設密碼");
  檢查(await 應失敗(() => 以身分(db, 丁帳, () => db.query("select public.set_member_password($1, 'abcd1234')", [丁id])), "只有具管理權限"), "一般會員不能用這個函式重設密碼");
  檢查(await 應失敗(() => 秘("select public.set_member_password($1, 'abcd1234')", [戊id]), "還沒有登入帳號"), "還沒有帳號的會員不能重設密碼");
  // 會員自己註冊：送連結申請，幹部核准
  const 申請id = (await 以身分(db, 戊帳, () => db.query("select public.submit_link_request('戊會員', '財政部關務署', '稽查組', '科員', 'wu@mail.mof.gov.tw', '', '') as id"))).rows[0].id;
  檢查(await 應失敗(() => 以身分(db, 戊帳, () => db.query("select public.submit_link_request('戊會員', '', '', '', '', '', '')")), "審核中"), "連結申請審核中不能重複送");
  檢查((await 以身分(db, 冒充, () => db.query("select count(*)::int as n from public.link_requests"))).rows[0].n === 0, "其他人看不到別人的連結申請");
  檢查(await 應失敗(() => 以身分(db, 戊帳, () => db.query("select public.approve_link_request($1, $2)", [申請id, 戊id])), "沒有權限"), "申請人不能自己核准連結");
  檢查(await 應失敗(() => 秘("select public.approve_link_request($1, $2)", [申請id, 丁id]), "已連結"), "不能把申請連到已有帳號的會員");
  await 秘("select public.approve_link_request($1, $2)", [申請id, 戊id]);
  檢查((await 以身分(db, 戊帳, () => db.query("select name, email from public.members"))).rows.map((r) => r.name + r.email).join() === "戊會員wu@mail.mof.gov.tw", "幹部核准後連結成功，名冊公務信箱不變");
  檢查(await 應失敗(() => 以身分(db, 丁帳, () => db.query("select public.unlink_member($1)", [丁id])), "只有具管理權限"), "一般會員不能解除連結");
  await 秘("select public.unlink_member($1)", [丁id]);
  檢查((await 以身分(db, 丁帳, () => db.query("select count(*)::int as n from public.members"))).rows[0].n === 0, "秘書長解除連結後，該帳號看不到會員資料");
  // 入會申請可填公務信箱
  const 己帳 = await 新帳("ji.personal@gmail.example");
  const 己申 = (await 以身分(db, 己帳, () => db.query("select public.submit_application('己同仁', '男', '', '財政部國庫署', '', '', '', '', 'JI@mail.mof.gov.tw') as id"))).rows[0].id;
  await 秘("select public.approve_application($1)", [己申]);
  檢查((await 以身分(db, 己帳, () => db.query("select email from public.members"))).rows[0].email === "ji@mail.mof.gov.tw", "入會申請填的公務信箱寫入名冊，帳號用個人信箱登入");
  檢查((await db.query("select login_email, email from public.applications where id = $1", [己申])).rows[0].login_email === 己帳.email.toLowerCase(), "入會申請另外記下申請人的登入 Email（寄信用），公務信箱只存資料");

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

  // 先送了連結申請、之後被 make_staff（或管理者建立帳號）連結：待審申請自動結案
  const 壬帳 = await 新帳("ren.personal@gmail.example");
  await 以身分(db, 壬帳, () => db.query("select public.submit_link_request('壬總幹事', '財政部賦稅署', '', '', 'ren@fia.example.gov', '', '')"));
  await 以身分(db, 壬帳, () => db.query("select public.submit_application('壬總幹事', '', '', '財政部賦稅署', '', '', '', '', 'ren@fia.example.gov')"));
  await db.query("select public.make_staff('ren.personal@gmail.example', '總幹事', '壬總幹事', 'ren@fia.example.gov')");
  const 壬申 = (await db.query("select (select status from public.link_requests where login_email = 'ren.personal@gmail.example') as l, (select status from public.applications where user_id = $1) as a", [壬帳.id])).rows[0];
  檢查(壬申.l === "核准" && 壬申.a === "核准", "帳號被 make_staff 連結後，原本待審的連結申請與入會申請自動結案");
  const 壬 = (await 以身分(db, 壬帳, () => db.query("select staff_role from public.members where user_id = auth.uid()"))).rows[0];
  檢查(壬 && 壬.staff_role === "總幹事", "先註冊、送過申請的人，執行 make_staff 後成為總幹事");
  // 管理者建立帳號（接管已註冊的帳號）也會結案
  const 癸id = (await 秘("insert into public.members (name, email) values ('癸會員', 'gui@fia.example.gov') returning id")).rows[0].id;
  const 癸帳 = await 新帳("gui.personal@gmail.example", false);
  await 以身分(db, 癸帳, () => db.query("select public.submit_link_request('癸會員', '', '', '', '', '', '')"));
  await 秘("select public.create_member_login($1, 'gui.personal@gmail.example', 'guipass12')", [癸id]);
  檢查((await db.query("select status from public.link_requests where user_id = $1", [癸帳.id])).rows[0].status === "核准", "管理者建立帳號連結後，原本待審的連結申請也自動結案");

  console.log("九、未登入者");
  for (const 表 of ["members", "activities", "registrations", "fees", "applications", "link_requests", "staff_roles", "board_titles"]) {
    檢查(await 應失敗(() => 以身分(db, null, () => db.query("select * from public." + 表))), "未登入者不能讀 " + 表);
  }
  檢查(await 應失敗(() => 以身分(db, null, () => db.query("select public.register_activity($1, '葷', '')", [活]))), "未登入者不能呼叫報名函式");
  檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.make_staff('x@example.org', '秘書長')"))), "登入者不能呼叫 make_staff（只能在 SQL Editor 用）");

  console.log("十、資安強化（審查發現的問題）");
  {
    const 新 = async (email) => { const u = { id: crypto.randomUUID(), email }; await db.query("insert into auth.users values ($1, $2, now())", [u.id, email]); return u; };
    const 長帳 = await 新("chair@gmail.example"), 辦帳 = await 新("clerk@gmail.example"), 分身 = await 新("clerk.alt@gmail.example"), 預建帳 = await 新("pre@gmail.example");
    await db.query("update auth.users set email_confirmed_at = null where id = $1", [預建帳.id]);
    await db.query("select public.make_staff('chair@gmail.example', '理事長', '測試理事長', 'chair@fia.example.gov')");
    await db.query("select public.make_staff('clerk@gmail.example', '承辦人', '測試承辦人', 'clerk@fia.example.gov')");
    const 長列 = (await db.query("select id from public.members where email = 'chair@fia.example.gov'")).rows[0].id;
    const 辦 = (sql, p) => 以身分(db, 辦帳, () => db.query(sql, p));
    // 1. 幹部不能直接改帳號連結
    檢查(await 應失敗(() => 辦("update public.members set user_id = $1 where id = $2", [分身.id, 長列])), "承辦人不能把理事長那筆改連到自己的分身帳號");
    檢查(await 應失敗(() => 辦("update public.members set user_id = null where id = $1", [長列])), "承辦人不能直接解除別人的帳號連結");
    檢查(await 應失敗(() => 辦("insert into public.members (name, user_id) values ('偷連', $1)", [分身.id])), "承辦人新增會員時不能指定帳號連結");
    檢查(await 應失敗(() => 辦("update public.members set status = '停權' where id = $1", [長列]), "只有具管理權限"), "承辦人不能把理事長停權");
    檢查(await 應失敗(() => 辦("update public.members set email = 'x@gmail.example' where id = $1", [長列]), "只有具管理權限"), "承辦人不能改幹部的 Email");
    檢查((await 以身分(db, 長帳, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "理事長", "上述攻擊後理事長權限不變");
    const 一般列 = (await db.query("insert into public.members (name, email) values ('一般會員丙', 'bing3@fia.example.gov') returning id")).rows[0].id;
    await 辦("update public.members set phone = '分機 9', status = '停權' where id = $1", [一般列]);
    檢查((await db.query("select phone, status from public.members where id = $1", [一般列])).rows[0].status === "停權", "承辦人仍可正常編輯一般會員（電話、會籍）");
    // 2. 預先建立、尚未連結的幹部列：非管理者不能替它建立帳號或核准連結
    await db.query("insert into public.members (name, email, staff_role) values ('預建秘書長', 'pre@fia.example.gov', '秘書長')");
    const 預建列 = (await db.query("select id from public.members where email = 'pre@fia.example.gov'")).rows[0].id;
    檢查(await 應失敗(() => 辦("select public.create_member_login($1, 'clerk.alt@gmail.example', 'abcd1234')", [預建列]), "只有具管理權限"), "承辦人不能替會員建立登入帳號（也就不能把分身連到幹部列）");
    const 分身申請 = (await 以身分(db, 分身, () => db.query("select public.submit_link_request('預建秘書長', '', '', '', 'pre@fia.example.gov', '', '') as id"))).rows[0].id;
    檢查(await 應失敗(() => 辦("select public.approve_link_request($1, $2)", [分身申請, 預建列]), "只有具管理權限"), "承辦人不能把連結申請核准到幹部列");
    await 以身分(db, 長帳, () => db.query("select public.create_member_login($1, 'pre@gmail.example', 'prepass12')", [預建列]));
    檢查((await 以身分(db, 預建帳, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "秘書長", "理事長替預建的幹部列建立帳號後，本人登入就是該角色");
    // 2b. 重設密碼：不能替其他具管理權限的幹部重設（避免接管別的管理者帳號）；自己的可以
    檢查(await 應失敗(() => 以身分(db, 長帳, () => db.query("select public.set_member_password($1, 'takeover1')", [預建列])), "不能替其他具管理權限"), "理事長不能替秘書長重設密碼");
    await 以身分(db, 長帳, () => db.query("select public.set_member_password($1, 'chairnew1')", [長列]));
    檢查((await db.query("select encrypted_password = extensions.crypt('chairnew1', encrypted_password) as ok from auth.users where id = $1", [長帳.id])).rows[0].ok, "管理者可以重設自己的密碼");
    await 以身分(db, 長帳, () => db.query("select public.set_member_password((select id from public.members where email = 'clerk@fia.example.gov'), 'clerknew1')"));
    檢查((await db.query("select encrypted_password = extensions.crypt('clerknew1', encrypted_password) as ok from auth.users where id = $1", [辦帳.id])).rows[0].ok, "管理者可以替不具管理權限的幹部（承辦人）重設密碼");
    // 2g. 承辦人先把分身連到一般會員（核准分身的連結申請），之後理事長指派幹部角色 → 擋下
    const 將任甲 = (await db.query("insert into public.members (name, email) values ('將任甲', 'future1@fia.example.gov') returning id")).rows[0].id;
    const 將任乙 = (await db.query("insert into public.members (name, email) values ('將任乙', 'future2@fia.example.gov') returning id")).rows[0].id;
    const 分身2 = await 新("clerk.alt2@gmail.example"), 分身3 = await 新("clerk.alt3@gmail.example");
    const 甲申 = (await 以身分(db, 分身2, () => db.query("select public.submit_link_request('將任甲', '', '', '', '', '', '') as id"))).rows[0].id;
    const 乙申 = (await 以身分(db, 分身3, () => db.query("select public.submit_link_request('將任乙', '', '', '', '', '', '') as id"))).rows[0].id;
    檢查(await 應失敗(() => 辦("select public.approve_link_request($1, $2)", [甲申, 將任甲]), "只有具管理權限"), "承辦人不能核准連結申請（v2.4 起只有管理者核准或退回）");
    // 承辦人改過這兩位的姓名（身分資料）→ 之後管理者核准連結時不算管理者連結
    await 辦("update public.members set name = '將任甲（改）' where id = $1", [將任甲]);
    await 辦("update public.members set name = '將任乙（改）' where id = $1", [將任乙]);
    const 長 = (sql, p) => 以身分(db, 長帳, () => db.query(sql, p));
    await 長("select public.approve_link_request($1, $2)", [甲申, 將任甲]);
    await 長("select public.approve_link_request($1, $2)", [乙申, 將任乙]);
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [將任甲]), "還沒經具管理權限"), "承辦人核准連結的會員，理事長不能直接指派幹部角色（防分身奪權）");
    檢查(await 應失敗(() => 長("update public.members set staff_role = '總幹事' where id = $1", [將任乙]), "還沒經具管理權限"), "同上（另一位）");
    檢查((await 以身分(db, 分身2, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "", "上述被擋後，分身帳號仍不是幹部");
    // 正確做法：解除連結 → 管理者替本人建立帳號 → 指派
    await 長("select public.unlink_member($1)", [將任甲]);
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [將任甲])).rows[0].linked_by_admin === false, "解除連結後「管理者連結」標記歸零");
    await 長("select public.create_member_login($1, 'future1.self@gmail.example', 'future123')", [將任甲]);
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [將任甲]), "還沒經具管理權限"), "管理者替改過身分資料的會員建立帳號後，還要先「已向本人核對」才能指派");
    await 長("select public.confirm_member_identity($1)", [將任甲]);
    await 長("update public.members set staff_role = '秘書長' where id = $1", [將任甲]);
    const 本人 = { id: (await db.query("select id from auth.users where email = 'future1.self@gmail.example'")).rows[0].id };
    檢查((await 以身分(db, 本人, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "秘書長", "管理者建立帳號連結的會員可以指派幹部角色");
    檢查(!(await db.query("select has_column_privilege('authenticated', 'public.members', 'linked_by_admin', 'UPDATE') or has_column_privilege('authenticated', 'public.members', 'linked_by_admin', 'INSERT') as ok")).rows[0].ok, "登入者不能直接改「管理者連結」標記");
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [長列])).rows[0].linked_by_admin === true, "make_staff 連結的帳號標記為管理者連結");
    // 2h. 管理者核准分身的入會申請後，承辦人把那筆改成「將升任的人」的姓名、Email、員工編號 → 不再算管理者連結，指派被擋
    const 分身4 = await 新("clerk.alt4@gmail.example");
    const 分身申 = (await 以身分(db, 分身4, () => db.query("select public.submit_application('林新人', '', '', '財政部國庫署', '', '', '', '', 'newbie4@fia.example.gov') as id"))).rows[0].id;
    const R列 = (await 長("select public.approve_application($1) as id", [分身申])).rows[0].id;
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [R列])).rows[0].linked_by_admin === true, "理事長核准的入會申請，帳號連結標記為管理者連結");
    await 辦("update public.members set name = '王未來', email = 'future@fia.example.gov', employee_no = 'E123' where id = $1", [R列]);
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [R列])).rows[0].linked_by_admin === false, "承辦人改了已連結那筆的姓名、Email、員工編號後，不再算管理者連結");
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [R列]), "還沒經具管理權限"), "理事長指派那筆為幹部時被擋（防止改名冒充後奪權）");
    檢查((await 以身分(db, 分身4, () => db.query("select public.my_staff_role() as r"))).rows[0].r === "", "上述被擋後，分身帳號仍不是幹部");
    await 以身分(db, 分身4, () => db.query("select public.update_my_profile('男', '財政部國庫署', '國庫組', '科員', '分機 1')"));
    // 2i. 已是幹部的會計把自己那筆改成將升任者的姓名、員工編號 → 理事長把那筆從會計改成秘書長時被擋
    const 計帳 = await 新("acct@gmail.example");
    await db.query("select public.make_staff('acct@gmail.example', '會計', '測試會計', 'acct@fia.example.gov')");
    const 計列 = (await db.query("select id from public.members where email = 'acct@fia.example.gov'")).rows[0].id;
    await 以身分(db, 計帳, () => db.query("update public.members set name = '王將任', employee_no = 'E777' where id = $1", [計列]));
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [計列]), "還沒經具管理權限"), "會計改了自己那筆的姓名、員工編號後，不能被直接改指派為秘書長");
    await 長("update public.members set staff_role = '' where id = $1", [計列]);
    檢查((await db.query("select staff_role from public.members where id = $1", [計列])).rows[0].staff_role === "", "取消幹部角色不受影響");
    // 2j. 承辦人先把還沒有帳號的會員 Email 改成分身信箱，再讓管理者照名冊 Email 建立帳號 → 不算管理者連結，指派被擋；核對後才能指派
    const 目標列 = (await db.query("insert into public.members (name, email) values ('王將來', 'wang.future@fia.example.gov') returning id")).rows[0].id;
    const 分身5 = await 新("wang.alt@gmail.example");
    await db.query("update auth.users set email_confirmed_at = null where id = $1", [分身5.id]);
    await 辦("update public.members set email = 'wang.alt@gmail.example' where id = $1", [目標列]);
    檢查((await db.query("select identity_by_staff from public.members where id = $1", [目標列])).rows[0].identity_by_staff === true, "承辦人改了未連結會員的 Email，留下「會計、承辦人修改過」標記");
    await 長("select public.create_member_login($1, 'wang.alt@gmail.example', 'wangpass1')", [目標列]);
    檢查((await db.query("select linked_by_admin from public.members where id = $1", [目標列])).rows[0].linked_by_admin === false, "照承辦人改過的 Email 建立帳號，不算管理者連結");
    檢查(await 應失敗(() => 長("update public.members set staff_role = '秘書長' where id = $1", [目標列]), "還沒經具管理權限"), "這時不能直接指派幹部（防分身奪權）");
    檢查(await 應失敗(() => 辦("select public.confirm_member_identity($1)", [目標列]), "只有具管理權限"), "承辦人不能自己按「已向本人核對」");
    await 長("select public.confirm_member_identity($1)", [目標列]);
    await 長("update public.members set staff_role = '總幹事' where id = $1", [目標列]);
    檢查((await db.query("select staff_role, identity_by_staff, linked_by_admin from public.members where id = $1", [目標列])).rows.map((r) => r.staff_role + r.identity_by_staff + r.linked_by_admin).join() === "總幹事falsetrue", "管理者核對後才能指派");
    const 管改列 = (await 辦("insert into public.members (name, email) values ('承辦人新增', 'staffadd@fia.example.gov') returning id")).rows[0].id;
    檢查((await db.query("select identity_by_staff from public.members where id = $1", [管改列])).rows[0].identity_by_staff === true, "承辦人新增的會員也有標記");
    await 長("update public.members set email = 'staffadd2@fia.example.gov' where id = $1", [管改列]);
    檢查((await db.query("select identity_by_staff from public.members where id = $1", [管改列])).rows[0].identity_by_staff === false, "管理者修改身分資料後清除標記");
    檢查(!(await db.query("select has_column_privilege('authenticated', 'public.members', 'identity_by_staff', 'UPDATE') as ok")).rows[0].ok, "登入者不能直接改標記");
    // 管理者可以看登入帳號（個人 Email）核對；其他人不行
    檢查((await 長("select public.member_login_email($1) as e", [R列])).rows[0].e === "clerk.alt4@gmail.example", "管理者看得到某位會員連結的登入帳號");
    檢查(await 應失敗(() => 辦("select public.member_login_email($1)", [R列]), "只有具管理權限"), "承辦人不能查登入帳號");
    // 3. 入會申請不依自填信箱連到既有會員
    const 冒用 = await 新("fake.applicant@gmail.example");
    const 冒申 = (await 以身分(db, 冒用, () => db.query("select public.submit_application('新人張三', '', '', '財政部賦稅署', '', '', '', '', 'bing3@fia.example.gov') as id"))).rows[0].id;
    檢查(await 應失敗(() => 辦("select public.approve_application($1)", [冒申]), "只有具管理權限"), "承辦人不能核准入會申請（v2.4 起只有管理者）");
    檢查(await 應失敗(() => 長("select public.approve_application($1)", [冒申]), "名冊已有公務信箱"), "入會申請填了名冊上已有的公務信箱時，核准會被擋下並提示改走帳號連結");
    檢查((await db.query("select user_id, status from public.members where id = $1", [一般列])).rows[0].user_id === null, "被冒用信箱的會員資料沒有被連走");
    const 正常申 = (await 以身分(db, await 新("newcomer@gmail.example"), () => db.query("select public.submit_application('新進丁', '', '', '財政部國庫署', '', '', '', '', 'ding4@fia.example.gov') as id"))).rows[0].id;
    await 長("select public.approve_application($1)", [正常申]);
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
    const 表們 = ["members", "activities", "registrations", "fees", "applications", "link_requests", "staff_roles", "board_titles"];
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
    檢查((await db.query("select to_regclass('public.claim_codes') is null as ok")).rows[0].ok, "認領碼資料表已移除");

    console.log("十一、系統設定：幹部角色與理監事職稱");
    // 角色
    檢查(await 應失敗(() => 辦("select public.add_staff_role('副秘書長', false)"), "只有具管理權限"), "承辦人不能修改系統設定");
    檢查(await 應失敗(() => 辦("insert into public.staff_roles (name) values ('偷加')")), "不能直接寫角色資料表");
    await 長("select public.add_staff_role(' 副秘書長 ', false)");
    檢查((await 以身分(db, 辦帳, () => db.query("select name from public.staff_roles order by sort"))).rows.map((r) => r.name).includes("副秘書長"), "理事長新增「副秘書長」（前後空白自動去掉），幹部讀得到清單");
    檢查(await 應失敗(() => 長("select public.add_staff_role('副秘書長', false)"), "已經有"), "不能重複新增");
    const 副列 = (await db.query("insert into public.members (name, email) values ('副秘書長甲', 'vice@fia.example.gov') returning id")).rows[0].id;
    await 長("update public.members set staff_role = '副秘書長' where id = $1", [副列]);
    檢查((await db.query("select staff_role from public.members where id = $1", [副列])).rows[0].staff_role === "副秘書長", "新角色可以指派給會員");
    檢查(await 應失敗(() => 長("select public.delete_staff_role('副秘書長')"), "還有 1 位會員"), "還有人是這個角色時不能刪除");
    await 長("update public.members set staff_role = '' where id = $1", [副列]);
    await 長("select public.delete_staff_role('副秘書長')");
    檢查(!(await db.query("select 1 from public.staff_roles where name = '副秘書長'")).rows.length, "沒人使用後可以刪除");
    // 具管理權限的新角色
    await 長("select public.add_staff_role('副理事長', true)");
    await 長("select public.create_member_login($1, 'vice.self@gmail.example', 'vicepass1')", [副列]);
    await 長("update public.members set staff_role = '副理事長' where id = $1", [副列]);
    const 副帳 = { id: (await db.query("select id from auth.users where email = 'vice.self@gmail.example'")).rows[0].id };
    檢查((await 以身分(db, 副帳, () => db.query("select public.is_admin() as a"))).rows[0].a === true, "新增「具管理權限」的角色後，擔任者就有管理權限");
    await 長("select public.set_staff_role_admin('副理事長', false)");
    檢查((await 以身分(db, 副帳, () => db.query("select public.is_admin() as a"))).rows[0].a === false, "取消該角色的管理權限後立即生效");
    await 長("select public.reorder_staff_roles(array['承辦人', '理事長'])");
    檢查((await db.query("select name from public.staff_roles order by sort, name limit 1")).rows[0].name === "承辦人", "可以調整角色在選單上的順序");
    // 職稱
    檢查(await 應失敗(() => 辦("select public.add_board_title('候補理事', '理事')"), "只有具管理權限"), "承辦人不能新增職稱");
    檢查((await db.query("select max_count, candidate from public.board_titles where title = '候補理事'")).rows[0].max_count === 5, "升級後預設就有「候補理事」（上限 5 位，候補）");
    await 長("update public.members set board_title = '候補理事', board_role = '' where id = $1", [副列]);
    檢查((await db.query("select board_role from public.members where id = $1", [副列])).rows[0].board_role === "理事", "新職稱可以用，理事或監事依職稱的歸類自動決定");
    檢查(await 應失敗(() => 長("select public.delete_board_title('候補理事')"), "不能刪除"), "候補理事有名額設定，不能刪除（有人在用，也不能刪掉再加回來）");
    檢查(await 應失敗(() => 長("select public.add_board_title('理|事', '理事')"), "不能有"), "職稱不能含「|」");
    檢查(await 應失敗(() => 長("select public.add_board_title('顧問', '會員代表')"), "理事」或「監事"), "職稱只能歸類為理事或監事");
    await 長("select public.delete_board_title('監事會召集人')");
    await db.exec(fs.readFileSync(path.join(根目錄, "線上系統", "資料庫結構.sql"), "utf8"));
    檢查(!(await db.query("select 1 from public.board_titles where title = '監事會召集人'")).rows.length && (await db.query("select 1 from public.board_titles where title = '候補理事'")).rows.length === 1,
      "重新執行結構不會把刪掉的預設職稱加回來，也不會清掉新增的職稱");
  }
  console.log("十二、刪除只能一筆一筆；申請可刪除；寄信用登入 Email");
  {
    const 秘2 = (sql, p) => 以身分(db, 帳.秘書長, () => db.query(sql, p));
    const 前 = (await db.query("select count(*)::int n from public.members")).rows[0].n;
    // 會員只能經由退會（刪除）申請單、由管理者確認後刪除（v2.5）；網頁與 REST 都不能直接 DELETE 會員
    檢查(await 應失敗(() => 秘2("delete from public.members where staff_role = '' and user_id is null"), "permission denied"), "管理者不能直接刪除會員（REST DELETE 被拒，一次刪很多位也一樣）");
    檢查(await 應失敗(() => 秘2("delete from public.members"), "permission denied"), "沒有條件的刪除（全部）也被拒絕");
    檢查((await db.query("select count(*)::int n from public.members")).rows[0].n === 前, "上述被拒後一位都沒少");
    const 單 = (await db.query("insert into public.members (name, email) values ('要刪的人', 'todelete@fia.example.gov') returning id")).rows[0].id;
    檢查(await 應失敗(() => 秘2("delete from public.members where id = $1", [單]), "permission denied"), "管理者一次刪一位也不能直接刪（要走退會申請）");
    檢查((await db.query("select count(*)::int n from public.members")).rows[0].n === 前 + 1, "被拒後那一位仍在名冊上");
    await db.query("delete from public.members where id = $1", [單]);  // 測試資料清理（SQL Editor 身分）
    // 申請紀錄可以刪（幹部），一次一筆
    const 申帳 = { id: crypto.randomUUID(), email: "del.applicant@gmail.example" };
    await db.query("insert into auth.users values ($1, $2, now())", [申帳.id, 申帳.email]);
    const 連申 = (await 以身分(db, 申帳, () => db.query("select public.submit_link_request('刪除測試', '', '', '', '', '', '') as id"))).rows[0].id;
    const 入申 = (await db.query("insert into public.applications (user_id, name, status) values ($1, '刪除測試二', '退回') returning id", [申帳.id])).rows[0].id;
    檢查((await 以身分(db, 申帳, () => db.query("delete from public.link_requests where id = $1 returning id", [連申]))).rows.length === 0, "申請人不能刪自己的連結申請（只有幹部能刪）");
    await 秘2("delete from public.link_requests where id = $1", [連申]);
    await 秘2("delete from public.applications where id = $1", [入申]);
    檢查(!(await db.query("select 1 from public.link_requests where id = $1", [連申])).rows.length && !(await db.query("select 1 from public.applications where id = $1", [入申])).rows.length, "幹部可以刪除連結申請、入會申請");
    // 先補幾筆申請紀錄，確保真的有「一大批」可以刪；被擋後筆數要與刪除前相同（不能靠「剩 0 筆」之類的條件假過）
    await db.query("insert into public.applications (user_id, name, status) values ($1, '刪除測試三', '退回'), ($1, '刪除測試四', '退回')", [申帳.id]);
    const 申數 = (await db.query("select count(*)::int n from public.applications")).rows[0].n;
    檢查(申數 >= 2 && (await 應失敗(() => 秘2("delete from public.applications"), "一次只能刪除一筆")) && (await db.query("select count(*)::int n from public.applications")).rows[0].n === 申數, "申請紀錄也不能一次刪一大批（被擋後筆數不變）");
    for (const 名 of ["刪除測試三", "刪除測試四"]) await 秘2("delete from public.applications where name = $1", [名]);
    // 寄信用登入 Email
    const 信 = (await 秘2("select public.member_login_emails(array(select id from public.members)) as j")).rows[0].j;
    檢查(信.some((x) => x.email === "jia@example.org") && 信.every((x) => x.member_id && x.email), "幹部取得會員的登入 Email（寄信用；沒有帳號的人不列）");
    檢查(await 應失敗(() => 以身分(db, 帳.甲, () => db.query("select public.member_login_emails(array[$1::uuid])", [甲id])), "沒有權限"), "一般會員不能取得別人的登入 Email");
  }
  // 不能把系統弄到沒有任何人具管理權限
  {
    const db2 = await 建立資料庫();
    const 唯一 = { id: crypto.randomUUID(), email: "only@gmail.example" };
    await db2.query("insert into auth.users values ($1, $2, now())", [唯一.id, 唯一.email]);
    await db2.query("select public.make_staff('only@gmail.example', '理事長', '唯一管理者', 'only@fia.example.gov')");
    檢查(await 應失敗(() => 以身分(db2, 唯一, () => db2.query("select public.set_staff_role_admin('理事長', false)")), "沒有任何人具管理權限"), "取消最後一位管理者所屬角色的管理權限會被擋");
    檢查(await 應失敗(() => 以身分(db2, 唯一, () => db2.query("select public.delete_staff_role('理事長')")), "還有 1 位"), "自己正在擔任的角色不能刪");
    await 以身分(db2, 唯一, () => db2.query("select public.delete_staff_role('秘書長')"));
    await 以身分(db2, 唯一, () => db2.query("select public.delete_staff_role('總幹事')"));
    檢查((await db2.query("select string_agg(name, ',' order by sort) as n from public.staff_roles")).rows[0].n === "理事長,會計,承辦人", "沒人使用的管理角色可以刪除");
    // 唯一的管理者不能把自己取消角色、停權、解除連結或刪除（會讓系統沒有管理者）
    const 唯一列 = (await db2.query("select id from public.members where user_id = $1", [唯一.id])).rows[0].id;
    const 唯 = (sql, p) => 以身分(db2, 唯一, () => db2.query(sql, p));
    檢查(await 應失敗(() => 唯("update public.members set staff_role = '' where id = $1", [唯一列]), "沒有任何人具管理權限"), "唯一的管理者不能取消自己的幹部角色");
    檢查(await 應失敗(() => 唯("update public.members set staff_role = '會計' where id = $1", [唯一列]), "沒有任何人具管理權限"), "唯一的管理者不能把自己改成不具管理權限的角色");
    檢查(await 應失敗(() => 唯("update public.members set status = '停權' where id = $1", [唯一列]), "沒有任何人具管理權限"), "唯一的管理者不能把自己停權");
    檢查(await 應失敗(() => 唯("select public.unlink_member($1)", [唯一列]), "沒有任何人具管理權限"), "唯一的管理者不能解除自己的帳號連結");
    檢查(await 應失敗(() => 唯("delete from public.members where id = $1", [唯一列]), "permission denied"), "會員不能被直接 DELETE（唯一的管理者也一樣，只能經退會申請）");
    // 有第二位管理者後就可以卸任
    const 二 = { id: crypto.randomUUID(), email: "second@gmail.example" };
    await db2.query("insert into auth.users values ($1, $2, now())", [二.id, 二.email]);
    await db2.query("select public.make_staff('second@gmail.example', '理事長', '第二位', 'second@fia.example.gov')");
    await 唯("update public.members set staff_role = '' where id = $1", [唯一列]);
    檢查((await db2.query("select staff_role from public.members where id = $1", [唯一列])).rows[0].staff_role === "", "另有管理者時可以卸下自己的管理角色");
  }

  console.log("十三、理監事名額；只有管理者核准或退回；退會（刪除）申請單");
  {
    const db3 = await 建立資料庫();
    const 新3 = async (email) => { const u = { id: crypto.randomUUID(), email }; await db3.query("insert into auth.users values ($1, $2, now())", [u.id, email]); return u; };
    const 秘u = await 新3("sec13@gmail.example"), 會u = await 新3("acc13@gmail.example"), 辦u = await 新3("clerk13@gmail.example");
    await db3.query("select public.make_staff('sec13@gmail.example', '秘書長', '秘十三', 'sec13@fia.example.gov')");
    await db3.query("select public.make_staff('acc13@gmail.example', '會計', '會計十三', 'acc13@fia.example.gov')");
    await db3.query("select public.make_staff('clerk13@gmail.example', '承辦人', '辦十三', 'clerk13@fia.example.gov')");
    const 秘3 = (sql, p) => 以身分(db3, 秘u, () => db3.query(sql, p));
    const 會3 = (sql, p) => 以身分(db3, 會u, () => db3.query(sql, p));
    const 辦3 = (sql, p) => 以身分(db3, 辦u, () => db3.query(sql, p));
    const 入 = (名, 職, email) => 秘3("insert into public.members (name, email, board_title) values ($1, $2, $3) returning id", [名, email, 職]);
    const 人數 = async (職) => (await db3.query("select count(*)::int n from public.members where board_title = $1 and status = '有效'", [職])).rows[0].n;

    // 理監事名額
    await 入("理事長甲", "理事長", "q1@x.org");
    檢查(await 應失敗(() => 入("理事長乙", "理事長", "q2@x.org"), "最多 1 位"), "理事長只能有 1 位");
    await 入("常務監事甲", "常務監事", "q3@x.org");
    檢查(await 應失敗(() => 入("常務監事乙", "常務監事", "q4@x.org"), "最多 1 位"), "常務監事只能有 1 位");
    檢查(await 應失敗(() => 秘3("insert into public.members (name, email, board_title) values ('兩位理事長A', 'q5@x.org', '理事長'), ('兩位理事長B', 'q6@x.org', '理事長')"), "最多 1 位"), "一個指令同時新增兩位理事長也會被擋（整批取消）");
    檢查((await 人數("理事長")) === 1, "上述被擋後，理事長仍然只有 1 位");
    for (let i = 1; i <= 14; i++) await 入("理事" + i, "理事", "r" + i + "@x.org");
    檢查((await db3.query("select count(*)::int n from public.members where board_role = '理事' and status = '有效'")).rows[0].n === 15, "理事組可以放滿 15 位（含理事長）");
    檢查(await 應失敗(() => 入("理事超額", "理事", "r15@x.org"), "理事組最多 15 位"), "理事組滿 15 位後，第 16 位會被擋");
    for (let i = 1; i <= 4; i++) await 入("監事" + i, "監事", "s" + i + "@x.org");
    檢查(await 應失敗(() => 入("監事超額", "監事", "s5@x.org"), "監事組最多 5 位"), "監事組含常務監事最多 5 位");
    for (let i = 1; i <= 5; i++) await 入("候補理事" + i, "候補理事", "c" + i + "@x.org");
    檢查(await 應失敗(() => 入("候補理事超額", "候補理事", "c6@x.org"), "「候補理事」最多 5 位"), "候補理事最多 5 位");
    檢查((await db3.query("select count(*)::int n from public.members where board_title = '候補理事'")).rows[0].n === 5, "理事組已滿時仍可登記候補理事（候補不占理事名額）");
    await 入("候補監事1", "候補監事", "cs1@x.org"); await 入("候補監事2", "候補監事", "cs2@x.org");
    檢查(await 應失敗(() => 入("候補監事超額", "候補監事", "cs3@x.org"), "「候補監事」最多 2 位"), "候補監事最多 2 位");
    await 秘3("update public.members set phone = '分機 1' where email = 'q1@x.org'");
    檢查((await db3.query("select phone from public.members where email = 'q1@x.org'")).rows[0].phone === "分機 1", "名額已滿時，修改其他欄位（電話）不受影響");
    await 秘3("update public.members set status = '停權' where email = 'r1@x.org'");
    await 入("理事替補", "理事", "r16@x.org");
    檢查(await 應失敗(() => 秘3("update public.members set status = '有效' where email = 'r1@x.org'"), "理事組最多 15 位"), "停權會釋出名額；原來的人重新有效時又要占名額，名額已滿就會被擋");
    const 長甲 = (await db3.query("select id from public.members where email = 'q1@x.org'")).rows[0].id;
    const 長甲申 = (await 會3("select public.request_removal($1, '退休') as id", [長甲])).rows[0].id;
    檢查(await 應失敗(() => 入("新理事長", "理事長", "q9@x.org"), "退會待審名單"), "名額被退會待審中的人佔住時，錯誤訊息說明要先到退會申請處理");
    await 秘3("select public.reject_removal($1, '')", [長甲申]);
    await db3.query("delete from public.removal_requests where id = $1", [長甲申]);  // 測試資料清理

    // 只有管理者核准或退回
    const 新申u = await 新3("applicant13@gmail.example");
    await 以身分(db3, 新申u, () => db3.query("select public.submit_application('新申人', '', '', '財政部國庫署', '', '', '', '')"));
    const 申請 = (await db3.query("select id from public.applications where user_id = $1", [新申u.id])).rows[0].id;
    檢查(await 應失敗(() => 辦3("select public.approve_application($1)", [申請]), "只有具管理權限"), "承辦人不能核准入會申請");
    檢查(await 應失敗(() => 會3("select public.reject_application($1, '不符')", [申請]), "只有具管理權限"), "會計不能退回入會申請");
    const 連u = await 新3("link13@gmail.example");
    const 連申 = (await 以身分(db3, 連u, () => db3.query("select public.submit_link_request('連結甲', '', '', '', '', '', '') as id"))).rows[0].id;
    檢查(await 應失敗(() => 會3("select public.approve_link_request($1, (select id from public.members where email = 'q1@x.org'))", [連申]), "只有具管理權限"), "會計不能核准連結申請");
    檢查(await 應失敗(() => 辦3("select public.reject_link_request($1, '不符')", [連申]), "只有具管理權限"), "承辦人不能退回連結申請");
    檢查(await 應失敗(() => 辦3("update public.applications set user_id = $1", [秘u.id]), "permission denied"), "承辦人不能直接改入會申請（連申請人的帳號都改不了）");
    await 秘3("select public.reject_link_request($1, '名冊上查無此人')", [連申]);
    檢查((await db3.query("select status, review_note from public.link_requests where id = $1", [連申])).rows[0].review_note === "名冊上查無此人", "管理者可以退回連結申請，原因留在申請單上");

    // 退會（刪除）申請單
    const 要退 = (await 入("要退會甲", "", "d1@x.org")).rows[0].id;
    const 一般u = await 新3("plain13@gmail.example");
    檢查(await 應失敗(() => 以身分(db3, 一般u, () => db3.query("select public.request_removal($1, '理由')", [要退])), "沒有權限"), "一般會員不能送出退會（刪除）申請");
    檢查(await 應失敗(() => 會3("select public.request_removal($1, '  ')", [要退]), "請填寫"), "退會（刪除）一定要寫原因");
    const 自己 = (await db3.query("select id from public.members where user_id = $1", [會u.id])).rows[0].id;
    const 退申 = (await 會3("select public.request_removal($1, '人事異動，已離職') as id", [要退])).rows[0].id;
    檢查((await db3.query("select status, member_name, reason from public.removal_requests where id = $1", [退申])).rows[0].status === "待刪除", "人事窗口（會計）送出後，申請單是待刪除");
    檢查(await 應失敗(() => 辦3("select public.request_removal($1, '重複')", [要退]), "已經在待審名單"), "同一位會員不能同時有兩件待刪除");
    檢查((await 會3("select count(*)::int n from public.removal_requests")).rows[0].n === 1, "幹部看得到退會申請單");
    檢查((await 以身分(db3, 一般u, () => db3.query("select count(*)::int n from public.removal_requests"))).rows[0].n === 0, "一般會員看不到退會申請單");
    檢查(await 應失敗(() => 會3("select public.confirm_removal($1)", [退申]), "只有具管理權限"), "會計不能確認刪除");
    檢查(await 應失敗(() => 辦3("select public.reject_removal($1, '不同意')", [退申]), "只有具管理權限"), "承辦人不能退回退會申請");
    await 秘3("select public.reject_removal($1, '')", [退申]);
    檢查((await db3.query("select status from public.members where id = $1", [要退])).rows.length === 1 && (await db3.query("select status from public.removal_requests where id = $1", [退申])).rows[0].status === "退回", "退回（不用填理由）後會員保留，申請單狀態為退回");
    // 有繳費紀錄的會員：可以刪除，收據保留（記著當時的姓名、編號），收據號碼不會再發給別人（v2.8）
    const 有收據 = (await 入("有收據乙", "", "d2@x.org")).rows[0].id;
    await 秘3("select public.record_fees(array[$1::uuid], 2026, '常年會費', 600, current_date, '現金')", [有收據]);
    const 收申 = (await 會3("select public.request_removal($1, '不續會') as id", [有收據])).rows[0].id;
    await 秘3("select public.confirm_removal($1)", [收申]);
    const 收 = (await db3.query("select member_id, member_name, receipt_no from public.fees where member_name = '有收據乙'")).rows[0];
    檢查(!(await db3.query("select 1 from public.members where id = $1", [有收據])).rows.length && 收 && 收.member_id === null && 收.receipt_no === "115-0001",
      "有繳費紀錄的會員也可以確認刪除：會員資料刪除，收據保留（記著當時的姓名）");
    const 下一位 = (await 入("下一位繳費", "", "d4@x.org")).rows[0].id;
    await 秘3("select public.record_fees(array[$1::uuid], 2026, '常年會費', 600, current_date, '現金')", [下一位]);
    檢查((await db3.query("select receipt_no from public.fees where member_id = $1", [下一位])).rows[0].receipt_no === "115-0002", "刪除會員後，收據號碼不會再發給別人");
    檢查((await 秘3("select public.record_fees(array[$1::uuid], 2027, '常年會費', 600, current_date, '現金') as n", [有收據])).rows[0].n === 0, "已刪除的會員不會被登記繳費（登記人數為 0，不會空掉收據號）");
    // 有報名未來活動的會員：刪除前先取消報名，候補自動遞補
    const 有報 = (await 入("有報名丙", "", "d3@x.org")).rows[0].id;
    const 候補人 = (await 入("候補丁", "", "d5@x.org")).rows[0].id;
    const 活動 = (await 秘3("insert into public.activities (name, date, capacity, waitlist) values ('退會測試活動', current_date + 30, 1, 1) returning id")).rows[0].id;
    await 秘3("select public.staff_register($1, $2, '', '')", [活動, 有報]);
    await 秘3("select public.staff_register($1, $2, '', '')", [活動, 候補人]);
    const 報申 = (await 會3("select public.request_removal($1, '調他機關') as id", [有報])).rows[0].id;
    await 秘3("select public.confirm_removal($1)", [報申]);
    檢查((await db3.query("select status from public.registrations where member_id = $1", [候補人])).rows[0].status === "正取", "刪除有報名的會員：先取消報名，候補自動遞補為正取");
    // 幹部把自己送進待審名單：標示本人；管理者不能處理自己的申請（說明原因），要由另一位管理者處理
    const 自申 = (await 會3("select public.request_removal($1, '退休') as id", [自己])).rows[0].id;
    檢查((await db3.query("select by_self from public.removal_requests where id = $1", [自申])).rows[0].by_self === true, "幹部也可以把自己送進待審名單（標示為本人申請）");
    await 秘3("select public.reject_removal($1, '')", [自申]);
    const 秘自 = (await db3.query("select id from public.members where user_id = $1", [秘u.id])).rows[0].id;
    const 秘自申 = (await 秘3("select public.request_removal($1, '退休') as id", [秘自])).rows[0].id;
    檢查(await 應失敗(() => 秘3("select public.confirm_removal($1)", [秘自申]), "管理者不能處理自己的退會申請，要由另一位管理者處理"), "管理者確認刪除自己時，說明「管理者不能處理自己的退會申請，要由另一位管理者處理」");
    檢查(await 應失敗(() => 秘3("select public.reject_removal($1, '')", [秘自申]), "要由另一位管理者處理"), "管理者也不能退回自己的申請");
    await db3.query("delete from public.removal_requests where id = $1", [秘自申]);  // 測試資料清理
    // 確認刪除：只刪這一位，申請單保留紀錄
    const 前 = (await db3.query("select count(*)::int n from public.members")).rows[0].n;
    const 再申 = (await 會3("select public.request_removal($1, '人事異動，已離職') as id", [要退])).rows[0].id;
    await 秘3("select public.confirm_removal($1)", [再申]);
    檢查((await db3.query("select count(*)::int n from public.members")).rows[0].n === 前 - 1 && !(await db3.query("select 1 from public.members where id = $1", [要退])).rows.length, "管理者確認後真的刪除這一位會員，其他人都還在");
    const 已 = (await db3.query("select status, member_id, member_name, reviewed_by from public.removal_requests where id = $1", [再申])).rows[0];
    檢查(已.status === "已刪除" && 已.member_id === null && 已.member_name === "要退會甲" && 已.reviewed_by === "秘十三", "申請單保留姓名、狀態改為已刪除、記下確認的管理者");
    檢查((await db3.query("select count(*)::int n from public.members where name = '理事長甲'")).rows[0].n === 1, "刪除一位不影響其他會員（含理事長）");
    // 直接 DELETE 不行（會繞過收據與報名檢查）；收據只有管理者能刪；待審的申請只有管理者能刪（v2.5）
    檢查(await 應失敗(() => 秘3("delete from public.members where id = $1", [有報]), "permission denied"), "管理者不能用 REST 直接刪會員（會繞過退會申請與收據、報名檢查）");
    檢查((await 辦3("delete from public.fees where member_name = '有收據乙' returning id")).rows.length === 0, "承辦人不能刪除收據");
    檢查((await 秘3("select count(*)::int n from public.fees")).rows[0].n === 2, "收據仍在（承辦人刪不掉，管理者也還沒刪）");
    const 待審申 = (await db3.query("select id from public.applications where user_id = $1 and status = '待審'", [新申u.id])).rows[0].id;
    檢查((await 辦3("delete from public.applications where id = $1 returning id", [待審申])).rows.length === 0, "承辦人不能刪除待審的入會申請");
    const 連u2 = await 新3("link13b@gmail.example");
    const 連申2 = (await 以身分(db3, 連u2, () => db3.query("select public.submit_link_request('連結乙', '', '', '', '', '', '') as id"))).rows[0].id;
    檢查((await 辦3("delete from public.link_requests where id = $1 returning id", [連申2])).rows.length === 0, "承辦人不能刪除待審的連結申請");
    檢查((await 秘3("delete from public.link_requests where id = $1 returning id", [連申2])).rows.length === 1, "管理者可以刪除待審的連結申請");
    檢查((await 秘3("delete from public.applications where id = $1 returning id", [待審申])).rows.length === 1, "管理者可以刪除待審的入會申請");
    // 有名額設定的職稱不能刪（否則刪掉再加回來就沒有上限）
    檢查(await 應失敗(() => 秘3("select public.delete_board_title('理事長')"), "不能刪除"), "理事長有名額設定，不能刪除");
    檢查(await 應失敗(() => 秘3("select public.delete_board_title('候補理事')"), "不能刪除"), "候補理事有名額設定，不能刪除");
  }

  console.log("十四、資料庫版本與網頁一致");
  {
    const 網頁要 = fs.readFileSync(path.join(根目錄, "製作", "src", "線上", "02_登入.js"), "utf8").match(/const 需要資料庫版本 = "([\d.]+)"/)[1];
    const 秘4 = (sql) => 以身分(db, 帳.秘書長, () => db.query(sql));
    檢查((await 秘4("select public.db_version() as v")).rows[0].v === 網頁要, "資料庫結構的 db_version()（" + 網頁要 + "）與網頁需要的版本一致");
    檢查(await 應失敗(() => 以身分(db, null, () => db.query("select public.db_version()"))), "未登入不能呼叫 db_version");
  }

  console.log("十五、會員本人申請退會；清空申請清單；會員編號清空重編");
  {
    const db5 = await 建立資料庫();
    const 新5 = async (email) => { const u = { id: crypto.randomUUID(), email }; await db5.query("insert into auth.users values ($1, $2, now())", [u.id, email]); return u; };
    const 秘u = await 新5("sec15@gmail.example"), 辦u = await 新5("clerk15@gmail.example"), 甲u = await 新5("mem15a@gmail.example"), 乙u = await 新5("mem15b@gmail.example");
    await db5.query("select public.make_staff('sec15@gmail.example', '秘書長', '秘十五', 'sec15@fia.example.gov')");
    await db5.query("select public.make_staff('clerk15@gmail.example', '承辦人', '辦十五', 'clerk15@fia.example.gov')");
    await db5.query("insert into public.members (name, email, user_id, join_date) values ('甲十五', 'a15@fia.example.gov', $1, '2020-05-01'), ('乙十五', 'b15@fia.example.gov', $2, '2019-01-01')", [甲u.id, 乙u.id]);
    const 身 = (u) => (sql, p) => 以身分(db5, u, () => db5.query(sql, p));
    const 秘5 = 身(秘u), 辦5 = 身(辦u), 甲5 = 身(甲u), 乙5 = 身(乙u);
    // 會員本人申請退會
    檢查(await 應失敗(() => 甲5("select public.request_my_removal('  ')"), "請填寫"), "會員申請退會一定要寫原因");
    await 甲5("select public.request_my_removal('工作異動')");
    檢查(await 應失敗(() => 甲5("select public.request_my_removal('再送')"), "審核中"), "審核中不能重複送退會申請");
    const 甲列 = (await 甲5("select by_self, requested_by_name, status from public.removal_requests")).rows;
    檢查(甲列.length === 1 && 甲列[0].by_self === true && 甲列[0].requested_by_name === "甲十五" && 甲列[0].status === "待刪除", "會員看得到自己的退會申請（標記為本人申請、待刪除）");
    檢查((await 乙5("select count(*)::int n from public.removal_requests")).rows[0].n === 0, "會員看不到別人的退會申請");
    檢查(await 應失敗(() => 以身分(db5, { id: crypto.randomUUID(), email: "x@x.org" }, () => db5.query("select public.request_my_removal('理由')")), "找不到您的會員資料"), "不是會員不能申請退會");
    await 甲5("select public.cancel_my_removal()");
    檢查((await db5.query("select count(*)::int n from public.removal_requests")).rows[0].n === 0, "會員可以撤回審核中的退會申請");
    檢查(await 應失敗(() => 甲5("select public.cancel_my_removal()"), "沒有可以撤回"), "沒有審核中的申請時不能撤回");
    // 管理者處理本人的申請：退回（不用填理由）或確認刪除
    const 甲申 = (await 甲5("select public.request_my_removal('工作異動') as id")).rows[0].id;
    檢查(await 應失敗(() => 辦5("select public.reject_removal($1, '')", [甲申]), "只有具管理權限"), "承辦人不能退回退會申請");
    await 秘5("select public.reject_removal($1, '')", [甲申]);
    檢查((await 甲5("select status from public.removal_requests where id = $1", [甲申])).rows[0].status === "退回", "管理者退回會員本人的申請（不用填理由），會員看得到結果");
    await 秘5("update public.members set status = '退會' where user_id = $1", [甲u.id]);
    const 乙申 = (await 乙5("select public.request_my_removal('不再參加') as id")).rows[0].id;
    await 秘5("select public.confirm_removal($1)", [乙申]);
    檢查(!(await db5.query("select 1 from public.members where user_id = $1", [乙u.id])).rows.length && (await 秘5("select status from public.removal_requests where id = $1", [乙申])).rows[0].status === "已刪除", "管理者確認本人的退會申請後刪除會員資料，申請單為已刪除");
    檢查((await 乙5("select count(*)::int n from public.removal_requests")).rows[0].n === 0, "會員資料刪除後，原帳號已不是會員，看不到申請單");
    檢查(await 應失敗(() => 甲5("select public.request_my_removal('再退一次')"), "已經是「退會」"), "會籍已經是退會的人不能再申請退會");
    // 幹部替會員送的申請：會員看不到內容，自己送時說明協會已在處理，也不能撤回
    const 丙u = await 新5("mem15c@gmail.example");
    const 丙列 = (await db5.query("insert into public.members (name, email, user_id) values ('丙會員十五', 'c15b@fia.example.gov', $1) returning id", [丙u.id])).rows[0].id;
    const 丙5 = 身(丙u);
    await 辦5("select public.request_removal($1, '人事通報離職')", [丙列]);
    檢查((await 丙5("select count(*)::int n from public.removal_requests")).rows[0].n === 0, "幹部替會員送的退會申請，會員看不到內容");
    檢查(await 應失敗(() => 丙5("select public.request_my_removal('我要退')"), "協會已經在處理"), "已有幹部送的申請時，會員自己送會說明協會已在處理");
    檢查(await 應失敗(() => 丙5("select public.cancel_my_removal()"), "沒有可以撤回"), "會員不能撤回幹部送的申請");
    // 換登入帳號：申請單跟著會員，不跟著舊帳號
    const 丁u = await 新5("mem15d.old@gmail.example"), 丁新 = await 新5("mem15d.new@gmail.example");
    const 丁列 = (await db5.query("insert into public.members (name, email, user_id) values ('丁會員十五', 'd15b@fia.example.gov', $1) returning id", [丁u.id])).rows[0].id;
    await 身(丁u)("select public.request_my_removal('搬家')");
    await 秘5("select public.unlink_member($1)", [丁列]);
    await db5.query("update public.members set user_id = $1 where id = $2", [丁新.id, 丁列]);
    檢查((await 身(丁u)("select count(*)::int n from public.removal_requests")).rows[0].n === 0 && await 應失敗(() => 身(丁u)("select public.cancel_my_removal()"), "沒有可以撤回"), "解除連結後，舊帳號看不到也撤不回這位會員的退會申請");
    檢查((await 身(丁新)("select count(*)::int n from public.removal_requests")).rows[0].n === 1, "改連新帳號後，新帳號看得到自己的退會申請");
    await 身(丁新)("select public.cancel_my_removal()");
    檢查(!(await db5.query("select 1 from public.removal_requests where member_id = $1", [丁列])).rows.length, "新帳號可以撤回");
    // 管理者不能處理自己的退會申請
    const 秘申 = (await 秘5("select public.request_my_removal('卸任退會') as id")).rows[0].id;
    檢查(await 應失敗(() => 秘5("select public.confirm_removal($1)", [秘申]), "管理者不能處理自己的退會申請，要由另一位管理者處理"), "管理者不能確認刪除自己（說明原因）");
    await 秘5("select public.cancel_my_removal()");
    // 清空清單：只有管理者；預設只清已處理的，選了才連待審一起清
    const 連A = await 新5("la15@gmail.example"), 連B = await 新5("lb15@gmail.example");
    const 連申A = (await 以身分(db5, 連A, () => db5.query("select public.submit_link_request('連A', '', '', '', '', '', '') as id"))).rows[0].id;
    await 以身分(db5, 連B, () => db5.query("select public.submit_link_request('連B', '', '', '', '', '', '')"));
    await 秘5("select public.reject_link_request($1, '查無此人')", [連申A]);
    檢查(await 應失敗(() => 辦5("select public.clear_review_list('link_requests')"), "只有具管理權限"), "承辦人不能清空清單");
    檢查((await 秘5("select public.clear_review_list('link_requests') as n")).rows[0].n === 1 && (await db5.query("select string_agg(status, ',') s from public.link_requests")).rows[0].s === "待審", "清空只清已處理的紀錄，待審的保留");
    檢查((await 秘5("select public.clear_review_list('link_requests', true) as n")).rows[0].n === 1 && !(await db5.query("select 1 from public.link_requests")).rows.length, "選擇「連待審的一起」才會清掉待審的");
    const 入A = await 新5("aa15@gmail.example"), 入B = await 新5("ab15@gmail.example");
    const 入申A = (await 以身分(db5, 入A, () => db5.query("select public.submit_application('入A', '', '', '財政部國庫署', '', '', '', '') as id"))).rows[0].id;
    await 以身分(db5, 入B, () => db5.query("select public.submit_application('入B', '', '', '財政部國庫署', '', '', '', '')"));
    await 秘5("select public.reject_application($1, '資料不全')", [入申A]);
    檢查((await 秘5("select public.clear_review_list('applications') as n")).rows[0].n === 1 && (await db5.query("select count(*)::int n from public.applications")).rows[0].n === 1, "入會申請清單也能清空已處理的");
    檢查((await 秘5("select public.clear_review_list('removal_requests') as n")).rows[0].n === 2, "退會申請清單也能清空已處理的（退回、已刪除）");
    const 秘列5 = (await db5.query("select id from public.members where user_id = $1", [秘u.id])).rows[0].id;
    await 辦5("select public.request_removal($1, '退休')", [秘列5]);
    await 秘5("select public.clear_review_list('removal_requests', true)");
    檢查((await db5.query("select count(*)::int n from public.removal_requests where member_id = $1 and status = '待刪除'", [秘列5])).rows[0].n === 1
      && (await db5.query("select count(*)::int n from public.removal_requests where status = '待刪除'")).rows[0].n === 1, "清空清單（連待審）不會清掉管理者自己的待審申請（要由另一位管理者處理）");
    檢查(await 應失敗(() => 秘5("select public.clear_review_list('members', true)"), "不認得"), "只能清空申請審核的三種清單（不能拿來清會員）");
    // 會員編號清空重編
    await db5.query("insert into public.members (name, email, member_no, agency, join_date) values ('丙十五', 'c15@x.org', 'M0050', '財政部賦稅署', '2018-03-01'), ('丁十五', 'd15@x.org', 'M0009', '財政部國庫署', null)");
    檢查(await 應失敗(() => 辦5("select public.renumber_members('編號')"), "只有具管理權限"), "承辦人不能重編會員編號");
    檢查(await 應失敗(() => 秘5("select public.renumber_members('亂排')"), "排序方式"), "排序方式只能是三種之一");
    // 退會待審名單裡的人排在最後，其他人照原來的編號順序
    const 待審條件 = "exists (select 1 from public.removal_requests r where r.member_id = m.id and r.status = '待刪除')";
    const 前序 = (await db5.query("select name from public.members m order by " + 待審條件 + ", nullif(regexp_replace(member_no, '\\D', '', 'g'), '')::numeric")).rows.map((r) => r.name);
    const 人數5 = (await 秘5("select public.renumber_members('編號') as n")).rows[0].n;
    const 重後 = (await db5.query("select name, member_no from public.members order by member_no")).rows;
    檢查(人數5 === 重後.length && 重後.every((r, i) => r.member_no === "M" + String(i + 1).padStart(4, "0")), "重編後編號從 M0001 連續編到 M" + String(重後.length).padStart(4, "0") + "（補掉空號）");
    檢查(重後.map((r) => r.name).join() === 前序.join(), "照目前編號順序重編，人的先後不變（退會待審名單裡的人排在最後）");
    await 秘5("select public.renumber_members('入會日期')");
    const 依日 = (await db5.query("select name from public.members order by member_no")).rows.map((r) => r.name);
    檢查(依日[0] === "丙十五" && 依日[依日.length - 1] === "秘十五" && 依日[依日.length - 2] === "丁十五", "依入會日期重編：最早入會的排第一，沒有入會日期的排在後面，退會待審的人排最後");
    const 新號 = (await db5.query("insert into public.members (name, email) values ('戊十五', 'e15@x.org') returning member_no")).rows[0].member_no;
    檢查(新號 === "M" + String(依日.length + 1).padStart(4, "0"), "重編後新增的會員接著編號");
  }

  console.log("\n資料庫測試：通過 " + 通過 + " 項，失敗 " + 失敗.length + " 項");
  失敗.forEach((f) => console.log("  ✘ " + f));
  process.exit(失敗.length ? 1 : 0);
}
