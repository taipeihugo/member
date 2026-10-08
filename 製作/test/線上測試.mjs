// 會員專區（線上系統）端對端測試：
//   以 PGlite 執行真正的 線上系統/資料庫結構.sql，前面加一層模擬的 Supabase（登入 API＋資料 API），
//   用無頭 Chromium 開 官網/portal/index.html，跑會員與幹部的主要流程，並截圖
// 用法：node 製作/build.mjs --test && node 製作/test/線上測試.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { 建立資料庫, 以身分 } from "./資料庫測試.mjs";

const 根目錄 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const 輸出 = path.join(根目錄, "製作", "test", "output");
const 截圖夾 = path.join(輸出, "截圖");
const 專區夾 = path.join(輸出, "官網", "portal");
const 網址 = "https://test.supabase.co";
const 最多列數 = 25;      // 模擬 Supabase 的 Max rows（正式預設 1000，測試用小一點才測得到分頁）
const 延遲 = {};          // 指定某個資料表回應延遲幾毫秒（測試換頁競態用）

let 通過 = 0;
const 失敗 = [];
const 主控台錯誤 = [];
// 記錄檢查結果
function 檢查(條件, 說明) {
  if (條件) { 通過++; console.log("  ✔ " + 說明); } else { 失敗.push(說明); console.log("  ✘ " + 說明); }
}

// ===== 模擬 Supabase =====
const db = await 建立資料庫();
const 帳號們 = new Map();   // email → {id, 密碼}
// 產生假的存取憑證（測試用，不簽章）
const 憑證 = (u) => "h." + Buffer.from(JSON.stringify({ sub: u.id, email: u.email })).toString("base64url") + ".s";
// 從請求標頭解出登入者
const 解憑證 = (標頭) => {
  const t = String(標頭.authorization || "").replace(/^Bearer /, "");
  if (!t.startsWith("h.")) return null;
  const 內容 = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
  return { id: 內容.sub, email: 內容.email };
};
const 帳號回應 = (u) => ({ access_token: 憑證(u), refresh_token: "r-" + u.id, expires_in: 3600, user: { id: u.id, email: u.email } });

// 把 PostgREST 的篩選參數轉成 SQL 條件
function 條件SQL(參數, 值們) {
  const 條 = [];
  for (const [k, v] of 參數) {
    if (k === "select" || k === "order" || k === "limit" || k === "offset") continue;
    if (!/^[a-z_]+$/.test(k)) throw new Error("不支援的欄位 " + k);
    if (v.startsWith("eq.")) { 值們.push(v.slice(3)); 條.push(`"${k}" = $${值們.length}`); }
    else if (v.startsWith("in.(")) { 值們.push(JSON.parse("[" + v.slice(4, -1) + "]")); 條.push(`"${k}"::text = any($${值們.length})`); }
    else throw new Error("不支援的篩選 " + v);
  }
  return 條.length ? " where " + 條.join(" and ") : "";
}
// 排序參數轉 SQL
function 排序SQL(參數) {
  const o = 參數.get("order");
  if (!o) return "";
  return " order by " + o.split(",").map((x) => { const [c, d] = x.split("."); if (!/^[a-z_]+$/.test(c)) throw new Error("排序欄位"); return `"${c}" ${d === "desc" ? "desc" : "asc"}`; }).join(", ");
}

// 處理資料 API（/rest/v1/…）
async function 資料API(方法, 路徑, 參數, 內容, 使用者) {
  const rpc = 路徑.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
  return 以身分(db, 使用者, async () => {
    if (rpc) {
      const 名 = rpc[1];
      const 參 = Object.keys(內容 || {});
      const 值們 = 參.map((k) => 內容[k]);
      const 回傳集合 = (await db.query("select proretset from pg_proc where proname = $1", [名])).rows[0];
      const sql = `select * from public.${名}(${參.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      const r = await db.query(sql, 值們);
      return 回傳集合 && 回傳集合.proretset ? r.rows : (r.rows[0] ? Object.values(r.rows[0])[0] : null);
    }
    const 表 = 路徑.match(/^\/rest\/v1\/([a-z_]+)$/)[1];
    const 值們 = [];
    if (方法 === "GET") {
      // 比照 Supabase：一次最多回「最多列數」筆，超過的部分要用 limit／offset 分頁；Content-Range 告知總數
      if (延遲[表]) await new Promise((r) => setTimeout(r, 延遲[表]));
      const 全部 = (await db.query(`select * from public.${表}${條件SQL(參數, 值們)}${排序SQL(參數)}`, 值們)).rows;
      const 起 = Number(參數.get("offset")) || 0;
      const 筆 = Math.min(Number(參數.get("limit")) || 最多列數, 最多列數);
      const 頁 = 全部.slice(起, 起 + 筆);
      return { __列: 頁, __範圍: (頁.length ? 起 + "-" + (起 + 頁.length - 1) : "*") + "/" + 全部.length };
    }
    if (方法 === "DELETE") return (await db.query(`delete from public.${表}${條件SQL(參數, 值們)} returning *`, 值們)).rows;
    if (方法 === "PATCH") {
      const 欄 = Object.keys(內容);
      欄.forEach((k) => 值們.push(內容[k]));
      return (await db.query(`update public.${表} set ${欄.map((k, i) => `"${k}" = $${i + 1}`).join(", ")}${條件SQL(參數, 值們)} returning *`, 值們)).rows;
    }
    if (方法 === "POST") {
      const 列 = [].concat(內容);
      // 比照 PostgREST：一次新增多筆時，每筆的欄位必須完全相同
      const 第一 = Object.keys(列[0] || {}).sort().join(",");
      if (列.some((r) => Object.keys(r).sort().join(",") !== 第一)) throw Object.assign(new Error("All object keys must match"), { 狀態: 400 });
      const 結果 = [];
      for (const 筆 of 列) {
        const 欄 = Object.keys(筆);
        結果.push(...(await db.query(`insert into public.${表} (${欄.map((k) => `"${k}"`).join(", ")}) values (${欄.map((_, i) => "$" + (i + 1)).join(", ")}) returning *`, 欄.map((k) => 筆[k]))).rows);
      }
      return 結果;
    }
    throw new Error("不支援的方法");
  });
}

// 處理登入 API（/auth/v1/…）
async function 登入API(方法, 路徑, 參數, 內容, 使用者) {
  if (路徑 === "/auth/v1/signup") {
    // 比照開啟 Email 驗證的 Supabase：已註冊的 Email 回一個沒有身分資料的假使用者（不報錯、不寄信）
    if (帳號們.has(內容.email)) return { id: crypto.randomUUID(), email: 內容.email, identities: [] };
    const u = { id: crypto.randomUUID(), email: 內容.email, 密碼: 內容.password };
    帳號們.set(內容.email, u);
    // 模擬「使用者已點驗證信」：直接標記已驗證；註冊回應不含登入憑證（需驗證 Email 的設定）
    await db.query("insert into auth.users values ($1, $2, now())", [u.id, u.email]);
    return { id: u.id, email: u.email };
  }
  if (路徑 === "/auth/v1/token" && 參數.get("grant_type") === "password") {
    const u = 帳號們.get(內容.email);
    if (!u || u.密碼 !== 內容.password) throw Object.assign(new Error("Invalid login credentials"), { 狀態: 400 });
    return 帳號回應(u);
  }
  if (路徑 === "/auth/v1/token" && 參數.get("grant_type") === "refresh_token") {
    const u = [...帳號們.values()].find((x) => "r-" + x.id === 內容.refresh_token);
    return 帳號回應(u);
  }
  if (路徑 === "/auth/v1/user" && 方法 === "GET") return { id: 使用者.id, email: 使用者.email };
  if (路徑 === "/auth/v1/user" && 方法 === "PUT") { 帳號們.get(使用者.email).密碼 = 內容.password; return { id: 使用者.id }; }
  if (路徑 === "/auth/v1/logout" || 路徑 === "/auth/v1/recover") return {};
  throw new Error("不支援的登入 API " + 路徑);
}

// 攔截瀏覽器發往 Supabase 的請求，交給模擬伺服器處理
async function 攔截(route) {
  const req = route.request();
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const u = new URL(req.url());
  const 內容 = req.postData() ? JSON.parse(req.postData()) : undefined;
  const 使用者 = 解憑證(req.headers());
  if (process.env.DEBUG_PORTAL) console.log("請求", req.method(), u.pathname, JSON.stringify(req.headers()).slice(0, 300));
  try {
    const 結果 = u.pathname.startsWith("/auth/") ? await 登入API(req.method(), u.pathname, u.searchParams, 內容, 使用者)
      : await 資料API(req.method(), u.pathname, u.searchParams, 內容, 使用者);
    if (結果 && 結果.__列) {
      await route.fulfill({ status: 200, headers: Object.assign({ "Content-Range": 結果.__範圍, "Access-Control-Expose-Headers": "Content-Range" }, cors), contentType: "application/json", body: JSON.stringify(結果.__列) });
    } else {
      await route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(結果) });
    }
  } catch (e) {
    await route.fulfill({ status: e.狀態 || 400, headers: cors, contentType: "application/json", body: JSON.stringify({ message: e.message }) });
  }
}

// ===== 測試資料 =====
await db.query(`insert into public.members (name, gender, agency, unit, title, email) values
  ('甲會員', '女', '財政部賦稅署', '稅制組', '科員', 'jia@example.org')`);
await db.query(`insert into public.activities (name, date, deadline, capacity, waitlist, meal_option, location) values
  ('年終會員聯誼餐敘', current_date + 30, current_date + 10, 1, 1, true, '臺北市餐廳（範例）'),
  ('職場健康講座', current_date + 20, current_date + 15, 0, 0, false, '財政部會議室（範例）')`);
fs.writeFileSync(path.join(專區夾, "連線設定.js"), `window.PORTAL_CONFIG = { url: "${網址}", anonKey: "test-anon-key-0123456789abcdef" };\n`);

// ===== 瀏覽器流程 =====
const browser = await chromium.launch({ env: Object.assign({}, process.env, { LANG: "C.UTF-8", LC_ALL: "C.UTF-8" }) });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") 主控台錯誤.push(m.text()); });
page.on("pageerror", (e) => 主控台錯誤.push(e.message));
await page.route(網址 + "/**", 攔截);
const 截圖 = (名) => page.screenshot({ path: path.join(截圖夾, 名 + ".png"), fullPage: true });
// 最上層對話框
const 框 = () => page.locator("dialog[open]").last();
// 註冊並登入
async function 註冊並登入(email, 密碼) {
  await page.goto("file://" + path.join(專區夾, "index.html"));
  await page.click("text=第一次使用？註冊帳號");
  await page.fill("#註冊信箱", email); await page.fill("#註冊密碼", 密碼); await page.fill("#註冊再次", 密碼);
  await page.click("#註冊鈕");
  await page.waitForSelector("text=請到信箱收驗證信");
  await page.click("text=回登入畫面");
  await 登入(email, 密碼);
}
// 登入
async function 登入(email, 密碼) {
  await page.goto("file://" + path.join(專區夾, "index.html"));
  await page.fill("#登入信箱", email); await page.fill("#登入密碼", 密碼);
  await page.click("#登入鈕");
  await page.waitForSelector("#側欄 button");
}
// 點左側選單
async function 選單(名) { await page.locator("#側欄 button", { hasText: 名 }).first().click(); await page.waitForTimeout(150); }

try {
  console.log("一、靜態檢查");
  const html = fs.readFileSync(path.join(根目錄, "官網", "portal", "index.html"), "utf8");
  const 網址們 = (html.match(/https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) || []).filter((x) => !/www\.w3\.org|schemas\.openxmlformats\.org/.test(x));
  檢查(網址們.length === 0 && html.includes("connect-src https://*.supabase.co"), "會員專區只允許連 Supabase（CSP），程式內沒有其他網址");
  檢查(!/localStorage|sessionStorage|indexedDB|document\.cookie|eval\(|new Function|document\.write|insertAdjacentHTML/.test(html), "不使用瀏覽器儲存區與禁用 API（登入資訊只在記憶體）");
  檢查(!/gsscloud|叡揚|\bgss\b/i.test(html), "不含參考廠商名稱");
  檢查(fs.readFileSync(path.join(根目錄, "官網", "index.html"), "utf8").includes('href="portal/index.html"'), "官網選單有「會員專區」連結");

  console.log("二、第一位幹部：先註冊，再在 SQL Editor 執行 make_staff");
  await page.goto("file://" + path.join(專區夾, "index.html"));
  await 截圖("專區_登入");
  await 註冊並登入("sec@example.org", "staffpass1");
  console.log("  " + (await db.query("select public.make_staff('sec@example.org', '秘書長', '陳秘書', 'sec@fia.example.gov') as r")).rows[0].r);
  await page.click("#登出鈕");
  // 同一個 Email 再註冊一次：開啟 Email 驗證時 Supabase 不報錯也不寄信，畫面要提醒直接登入
  await page.click("text=第一次使用？註冊帳號");
  await page.fill("#註冊信箱", "sec@example.org"); await page.fill("#註冊密碼", "whatever12"); await page.fill("#註冊再次", "whatever12");
  await page.click("#註冊鈕");
  檢查(await page.waitForSelector("text=這個 Email 已經註冊過了", { timeout: 5000 }).then(() => true, () => false), "已註冊的 Email 再註冊時，提示直接登入（不會誤以為有寄信）");
  await 登入("sec@example.org", "staffpass1");
  const 選單項 = (await page.locator("#側欄 button").allInnerTexts()).join();
  檢查(選單項.includes("會員管理") && 選單項.includes("申請審核") && 選單項.includes("活動管理") && 選單項.includes("會費管理"), "秘書長登入後看得到幹部功能");

  console.log("三、會員管理：匯入標準名冊（含理監事、會員代表）");
  await 選單("會員管理");
  const csv = path.join(輸出, "線上名冊.csv");
  fs.writeFileSync(csv, "﻿姓名,女0男1,服務機關,服務單位,職稱,電子郵件信箱,理監事,會員代表\n" +
    "甲會員,0,財政部賦稅署,稽核組,專員,JIA@example.org,,是\n" +
    "乙理事長,1,財政部關務署,稽查組,科長,yi@example.org,理事長,是\n" +
    "丙監事,0,財政部國庫署,國庫管理組,科員,bing@example.org,監事,\n" +
    "丁候補,1,財政部國庫署,國庫管理組,科員,ding@example.org,候補理事,\n" +
    "丙監事,0,財政部國庫署,國庫管理組,科員,BING@example.org,監事,\n" +
    Array.from({ length: 30 }, (_, i) => "批次會員" + (i + 1) + ",1,財政部財政資訊中心,系統組,科員,batch" + (i + 1) + "@example.org,,\n").join(""));
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#匯入名冊鈕")]);
  await fc.setFiles(csv);
  await 框().waitFor();
  const 預覽 = await 框().innerText();
  檢查(預覽.includes("新增 33 人、更新 1 人"), "Email 相同者更新、其他新增（檔案內重複的人合併）");
  檢查(預覽.includes("候補理事") && 預覽.includes("已合併"), "預覽列出看不懂的理監事與檔案內重複的列");
  await 框().locator("button", { hasText: "開始匯入" }).click();
  await page.waitForSelector("text=匯入完成：新增 33、更新 1");
  檢查(true, "混有看不懂理監事的列時，整批照樣匯入成功（欄位一致）");
  const 乙 = (await db.query("select board_role, board_title, is_representative from public.members where email = 'yi@example.org'")).rows[0];
  const 丙 = (await db.query("select board_role, is_representative from public.members where email = 'bing@example.org'")).rows[0];
  檢查(乙.board_role === "理事" && 乙.board_title === "理事長" && 乙.is_representative, "匯入：理事長＋會員代表");
  檢查(丙.board_role === "監事" && !丙.is_representative, "匯入：監事");
  await page.waitForTimeout(300);
  檢查((await page.locator("#內容").innerText()).includes("有效會員 35 人；理事 1 人、監事 1 人、會員代表 2 人"), "匯入後人數統計即時更新（超過單次回傳上限仍完整讀取）");
  檢查((await page.locator(".分頁列").innerText()).includes("共 35 筆"), "會員列表分頁讀取全部 35 筆（模擬上限 25 筆）");
  await 截圖("專區_會員管理");
  // 編輯甲：設為常務理事＋會員代表
  await page.fill(".表工具列 input[type=search]", "甲會員");
  await page.locator("#內容 tbody tr").first().click();
  await 框().locator("[data-key='理監事']").selectOption("理事|常務理事");
  await 框().locator("button", { hasText: "儲存" }).click();
  await page.waitForTimeout(400);
  const 甲 = (await db.query("select board_role, board_title, is_representative, unit from public.members where email = 'jia@example.org'")).rows[0];
  檢查(甲.board_role === "理事" && 甲.board_title === "常務理事" && 甲.is_representative && 甲.unit === "稽核組", "編輯：常務理事（理事）＋會員代表並存");
  // 匯出標準名冊
  await page.fill(".表工具列 input[type=search]", "");
  await page.click("#匯出標準名冊鈕");
  const [dl] = await Promise.all([page.waitForEvent("download"), 框().locator("button", { hasText: "CSV" }).click()]);
  const 出 = path.join(輸出, "下載", "線上匯出.csv");
  fs.mkdirSync(path.dirname(出), { recursive: true });
  await dl.saveAs(出);
  檢查(fs.readFileSync(出, "utf8").replace(/^\uFEFF/, "").startsWith("姓名,女0男1,服務機關,服務單位,職稱,電子郵件信箱"), "匯出標準格式名冊");
  // 產生認領碼（甲；秘書長已連結帳號會被略過）
  await page.locator(".表工具列 select").nth(4).selectOption("未註冊");
  await page.locator("#內容 tbody tr", { hasText: "甲會員" }).locator(".勾 input").check();
  await page.locator(".批次列 button", { hasText: "產生認領碼" }).click();
  await 框().locator("button", { hasText: "產生" }).click();
  await page.waitForSelector("#認領碼表");
  const 甲碼 = (await page.locator("#認領碼表 tbody td:nth-child(4)").first().innerText()).trim();
  檢查(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(甲碼), "幹部替會員產生認領碼（" + 甲碼 + "）");
  await 截圖("專區_認領碼");
  await 框().locator("button", { hasText: "列印紙條" }).click();
  檢查((await page.evaluate(() => window.__T.狀態.最後列印 || "")).includes(甲碼), "可列印認領碼紙條");
  await 框().locator("button", { hasText: "關閉" }).last().click();
  await page.click("#登出鈕");

  console.log("四、一般會員：個人 Email 註冊、認領碼連結、我的資料、報名（葷素）");
  await 註冊並登入("jia.home@gmail.example", "memberpass1");
  await page.waitForSelector("#認領碼");
  檢查((await page.locator("#側欄").innerText()).includes("連結會員資料"), "個人 Email 登入後先到「連結會員資料」");
  await 截圖("專區_連結會員資料");
  // 故意輸入錯的認領碼：伺服器回 400，瀏覽器會記一筆網路錯誤，這一筆是預期的
  const 錯誤數 = 主控台錯誤.length;
  await page.fill("#認領碼", "abcde-fghjk");
  await page.click("#認領鈕");
  await page.waitForSelector("text=認領碼不正確");
  const 新增錯誤 = 主控台錯誤.splice(錯誤數);
  檢查(新增錯誤.every((e) => /status of 400/.test(e)), "錯誤的認領碼被拒絕並顯示提示");
  await page.fill("#認領碼", 甲碼.toLowerCase());
  await page.click("#認領鈕");
  await page.waitForSelector("text=常務理事");
  檢查((await page.locator("#內容").innerText()).includes("會員代表"), "輸入認領碼後連結名冊，看得到自己的職務（常務理事、會員代表）");
  const 會員選單 = (await page.locator("#側欄 button").allInnerTexts()).join();
  檢查(!會員選單.includes("會員管理") && 會員選單.includes("活動報名") && 會員選單.includes("繳費紀錄"), "一般會員看不到幹部功能");
  const 可見會員 = await page.evaluate(async () => {
    const r = await fetch(window.__T.連線.網址 + "/rest/v1/members?select=*", { headers: { apikey: "x", Authorization: "Bearer " + window.__T.連線.憑證 } });
    return (await r.json()).length;
  });
  檢查(可見會員 === 1, "會員直接呼叫 API 也只拿到自己一筆（資料庫權限）");
  await 截圖("專區_我的資料");
  await page.click("#修改我的資料鈕");
  await 框().locator("[data-key='phone']").fill("分機 5566");
  await 框().locator("button", { hasText: "儲存" }).click();
  await page.waitForSelector("text=分機 5566");
  檢查(true, "會員修改自己的電話");
  await 選單("活動報名");
  await page.waitForSelector("text=年終會員聯誼餐敘");
  await page.locator(".卡", { hasText: "年終會員聯誼餐敘" }).locator("button", { hasText: "我要報名" }).click();
  await 框().locator("[data-key='meal']").selectOption("素");
  await 框().locator("button", { hasText: "確認報名" }).click();
  await page.waitForSelector("text=您已報名：正取");
  檢查((await page.locator(".卡", { hasText: "年終會員聯誼餐敘" }).innerText()).includes("素食"), "報名成功並記錄素食");
  await 截圖("專區_活動報名");
  await page.click("#登出鈕");

  console.log("五、沒有認領碼：送連結申請；非會員：線上入會申請");
  await 註冊並登入("yi.home@gmail.example", "memberpass2");
  await page.waitForSelector("#送出連結申請鈕");
  await page.locator("[data-key='name']").fill("乙理事長");
  await page.locator("[data-key='agency']").selectOption("財政部關務署");
  await page.locator("[data-key='office_email']").fill("yi@example.org");
  await page.click("#送出連結申請鈕");
  await page.waitForSelector("text=連結申請正在審核");
  檢查(true, "送出連結申請後顯示審核中");
  await page.click("#登出鈕");
  await 註冊並登入("newbie@gmail.example", "newbiepass1");
  await 選單("入會申請");
  await page.waitForSelector("#送出申請鈕");
  await page.locator("[data-key='email']").fill("newbie@mail.example.gov");
  await page.locator("[data-key='name']").fill("新進同仁");
  await page.locator("[data-key='agency']").selectOption("財政部財政資訊中心");
  await page.locator("[data-key='同意']").check();
  await 截圖("專區_入會申請");
  await page.click("#送出申請鈕");
  await page.waitForSelector("text=申請審核中");
  檢查(true, "送出入會申請後顯示審核中");
  await page.click("#登出鈕");

  console.log("六、幹部：審核、葷素統計、簽到、會費");
  await 登入("sec@example.org", "staffpass1");
  await 選單("申請審核");
  await page.locator("#內容 tbody tr", { hasText: "乙理事長" }).locator("button", { hasText: "核准" }).click();
  檢查((await 框().locator("[data-key='member'] option:checked").innerText()).includes("乙理事長"), "核准連結時自動預選名冊上對應的會員（公務信箱相同）");
  await 截圖("專區_核准連結");
  await 框().locator("button", { hasText: "核准連結" }).click();
  await 框().locator("button", { hasText: "確定連結" }).click();
  await page.waitForSelector("text=已連結：乙理事長");
  檢查((await db.query("select u.email from public.members m join auth.users u on u.id = m.user_id where m.email = 'yi@example.org'")).rows[0].email === "yi.home@gmail.example", "核准後乙的個人帳號連到名冊（公務信箱不變）");
  await page.locator(".頁籤 button", { hasText: "入會申請" }).click();
  await page.locator("#內容 tbody tr", { hasText: "新進同仁" }).locator("button", { hasText: "核准" }).click();
  await 框().locator("button", { hasText: "核准" }).click();
  await page.waitForSelector("text=已核准");
  檢查((await db.query("select status from public.applications")).rows[0].status === "核准", "核准入會申請");
  await 選單("活動管理");
  await page.locator("#內容 tbody tr", { hasText: "年終會員聯誼餐敘" }).click();
  await page.waitForSelector("#葷素_素");
  檢查((await page.locator("#葷素_素").innerText()) === "1" && (await page.locator("#葷素_葷").innerText()) === "0", "活動名單統計葷素人數");
  await page.click("#代為報名鈕");
  await 框().locator("[data-key='member']").selectOption({ label: (await 框().locator("[data-key='member'] option", { hasText: "乙理事長" }).innerText()).trim() });
  await 框().locator("[data-key='meal']").selectOption("葷");
  await 框().locator("button", { hasText: "儲存" }).click();
  await page.waitForSelector("text=已代為報名（候補）");
  檢查(true, "名額滿時代為報名列候補");
  await page.waitForTimeout(400);
  await page.locator("#內容 tbody tr", { hasText: "甲會員" }).locator(".勾 input").check();
  await page.locator(".批次列 button", { hasText: "簽到" }).first().click();
  await page.waitForSelector("text=已簽到");
  await page.waitForTimeout(400);
  await 截圖("專區_活動名單");
  await 選單("會費管理");
  await page.locator("#內容 tbody tr", { hasText: "甲會員" }).locator(".勾 input").check();
  await page.locator(".批次列 button", { hasText: "登記繳費" }).click();
  await 框().locator("[data-key='amount']").fill("600");
  await 框().locator("button", { hasText: "儲存" }).click();
  await page.waitForSelector("text=已登記 1 人");
  await page.waitForTimeout(400);
  await 截圖("專區_會費管理");
  await page.click("#登出鈕");

  console.log("七、會員看繳費紀錄、新會員登入");
  await 登入("jia.home@gmail.example", "memberpass1");
  await 選單("繳費紀錄");
  await page.waitForSelector("text=115-0001");
  檢查(true, "會員看得到自己的繳費紀錄與收據號");
  await page.click("#登出鈕");
  await 登入("yi.home@gmail.example", "memberpass2");
  await page.waitForSelector("text=理事長");
  檢查(true, "連結申請核准後，乙重新登入看到自己的資料");
  await page.click("#登出鈕");
  await 登入("newbie@gmail.example", "newbiepass1");
  await page.waitForSelector("text=新進同仁");
  檢查((await page.locator("#側欄").innerText()).includes("活動報名"), "核准後申請人重新登入即為會員");
  檢查((await page.locator("#內容").innerText()).includes("newbie@mail.example.gov"), "名冊上記錄的是申請時填的公務信箱");
  // 手機寬度（360px 窄手機，活動報名頁）
  await page.setViewportSize({ width: 360, height: 780 });
  await page.click("#選單鈕");   // 手機版選單收在左側，先打開
  await 選單("活動報名");
  await page.waitForSelector("text=年終會員聯誼餐敘");
  檢查(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "360px 手機寬度的活動報名頁沒有左右捲動");
  await 截圖("專區_手機");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.click("#登出鈕");

  console.log("八、信件連結的安全處理");
  const 甲帳 = 帳號們.get("jia.home@gmail.example");
  // 別人做的「驗證完成」連結夾帶他自己的登入憑證：不可以直接登入
  await page.goto("about:blank");
  await page.goto("file://" + path.join(專區夾, "index.html") + "#access_token=" + 憑證(甲帳) + "&refresh_token=r-" + 甲帳.id + "&expires_in=3600&type=signup");
  await page.waitForSelector("text=Email 驗證完成，請用 Email 與密碼登入");
  檢查((await page.evaluate(() => window.__T.連線.憑證)) === "" && !(await page.evaluate(() => location.hash)), "驗證信連結不會直接登入（防止被塞別人的帳號），網址上的憑證已清除");
  // 重設密碼連結：顯示是哪個帳號，設定完要用新密碼重新登入
  await page.goto("about:blank");
  await page.goto("file://" + path.join(專區夾, "index.html") + "#access_token=" + 憑證(甲帳) + "&refresh_token=r-" + 甲帳.id + "&expires_in=3600&type=recovery");
  await page.waitForSelector("text=正在為 jia.home@gmail.example 設定新密碼");
  await page.fill("#新密碼", "newpass123"); await page.fill("#新密碼再次", "newpass123");
  await page.click("#儲存新密碼鈕");
  await page.waitForSelector("text=密碼已更新，請用新密碼登入");
  檢查((await page.evaluate(() => window.__T.連線.憑證)) === "", "重設密碼後回到登入畫面，不沿用連結裡的憑證");
  await 登入("jia.home@gmail.example", "newpass123");
  檢查(true, "用新密碼可以登入");
  await page.click("#登出鈕");
  // 過期的連結
  await page.goto("about:blank");
  await page.goto("file://" + path.join(專區夾, "index.html") + "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  檢查(await page.isVisible("text=連結已失效"), "過期的信件連結顯示「連結已失效」");

  console.log("九、登出時還在讀取的畫面不會蓋過登入畫面");
  await 登入("sec@example.org", "staffpass1");
  延遲.members = 1500;
  await page.locator("#側欄 button", { hasText: "會員管理" }).first().click();
  await page.waitForTimeout(100);
  await page.click("#登出鈕");
  await page.waitForTimeout(2200);
  延遲.members = 0;
  檢查(await page.isVisible("#登入信箱") && (await page.locator("#內容 tbody tr").count()) === 0, "登出後，前一位使用者還在讀取的名冊不會出現在畫面上");
  await 截圖("專區_手機");
} catch (e) {
  失敗.push("測試中斷：" + (e.stack || e.message));
  console.error(e);
  await 截圖("專區_失敗當下").catch(() => {});
} finally {
  await browser.close();
}
console.log("\n主控台錯誤：" + 主控台錯誤.length);
主控台錯誤.forEach((e) => console.log("  " + e));
檢查(主控台錯誤.length === 0, "主控台錯誤＝0");
console.log("\n會員專區測試：通過 " + 通過 + " 項，失敗 " + 失敗.length + " 項");
失敗.forEach((f) => console.log("  ✘ " + f));
process.exit(失敗.length ? 1 : 0);
