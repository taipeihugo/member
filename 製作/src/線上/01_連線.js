// 檔案說明：與 Supabase 連線（登入、註冊、忘記密碼、讀寫資料、呼叫資料庫函式）；登入資訊只放在記憶體，關掉頁面就清除

const 連線 = {
  網址: "",        // Supabase 專案網址（在 連線設定.js 填寫）
  金鑰: "",        // Supabase 公開金鑰（anon key，本身沒有讀取權限，資料由資料庫權限保護）
  憑證: "",        // 登入後的存取憑證（只在記憶體）
  更新憑證: "",    // 用來延長登入的憑證（只在記憶體）
  計時器: 0,
  帳號: null       // {id, email}
};

// 讀取 連線設定.js 的內容；沒填好回傳 false
function 讀連線設定() {
  const 設 = window.PORTAL_CONFIG || {};
  連線.網址 = String(設.url || "").replace(/\/+$/, "");
  連線.金鑰 = String(設.anonKey || "");
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(連線.網址) && 連線.金鑰.length > 20;
}

// 發出一個網路請求並解析回應；失敗時丟出中文錯誤
async function 請求(路徑, 選項) {
  選項 = 選項 || {};
  const 標頭 = Object.assign({ apikey: 連線.金鑰, "Content-Type": "application/json" }, 選項.標頭 || {});
  if (連線.憑證 && !選項.不帶憑證) 標頭.Authorization = "Bearer " + 連線.憑證;
  let 回應;
  try {
    回應 = await fetch(連線.網址 + 路徑, { method: 選項.方法 || "GET", headers: 標頭, body: 選項.內容 === undefined ? undefined : JSON.stringify(選項.內容) });
  } catch (e) {
    throw new Error("無法連線，請檢查網路");
  }
  const 文字 = await 回應.text();
  let 資料 = null;
  try { 資料 = 文字 ? JSON.parse(文字) : null; } catch (e) { 資料 = 文字; }
  if (!回應.ok) throw new Error(翻譯錯誤(資料, 回應.status));
  return 資料;
}

// 把伺服器的錯誤訊息轉成看得懂的中文
function 翻譯錯誤(資料, 狀態碼) {
  const 原文 = (資料 && (資料.message || 資料.error_description || 資料.msg || 資料.error)) || "";
  const 對照 = [
    [/Invalid login credentials/i, "Email 或密碼不正確"],
    [/Email not confirmed/i, "Email 尚未驗證，請先到信箱點驗證連結"],
    [/User already registered/i, "這個 Email 已經註冊過了，請直接登入或使用「忘記密碼」"],
    [/Password should be at least/i, "密碼長度不足（至少 8 個字元）"],
    [/rate limit|too many/i, "操作太頻繁，請稍後再試"],
    [/JWT expired/i, "登入已逾時，請重新登入"],
    [/row-level security|permission denied/i, "沒有權限執行這個動作"],
    [/duplicate key.*members_email/i, "已有相同 Email 的會員"],
    [/duplicate key/i, "資料重複"],
    [/members_board_title_ok/i, "理監事職稱與身分不符（理事、監事只能擇一）"]
  ];
  for (const [規則, 中文] of 對照) if (規則.test(原文)) return 中文;
  if (/[一-鿿]/.test(原文)) return 原文;
  return 原文 ? "操作失敗（" + 原文 + "）" : "操作失敗（代碼 " + 狀態碼 + "）";
}

// 目前頁面網址（驗證信、重設密碼信點回來的位置）
function 回到網址() {
  return location.origin + location.pathname;
}

// 用 Email＋密碼登入
async function 登入帳號(email, 密碼) {
  const r = await 請求("/auth/v1/token?grant_type=password", { 方法: "POST", 內容: { email: email, password: 密碼 }, 不帶憑證: true });
  設定憑證(r);
}

// 記下登入憑證，並在到期前自動延長
function 設定憑證(r) {
  連線.憑證 = r.access_token;
  連線.更新憑證 = r.refresh_token || 連線.更新憑證;
  連線.帳號 = r.user ? { id: r.user.id, email: r.user.email } : 連線.帳號;
  clearTimeout(連線.計時器);
  const 秒 = Math.max(60, (Number(r.expires_in) || 3600) - 120);
  連線.計時器 = setTimeout(延長登入, 秒 * 1000);
}

// 用更新憑證延長登入；失敗就回到登入畫面
async function 延長登入() {
  try {
    const r = await 請求("/auth/v1/token?grant_type=refresh_token", { 方法: "POST", 內容: { refresh_token: 連線.更新憑證 }, 不帶憑證: true });
    設定憑證(r);
  } catch (e) {
    清除登入();
    提示("登入已逾時，請重新登入", true);
    顯示登入頁();
  }
}

// 註冊新帳號（會寄驗證信到信箱）
async function 註冊帳號(email, 密碼) {
  const r = await 請求("/auth/v1/signup?redirect_to=" + encodeURIComponent(回到網址()), { 方法: "POST", 內容: { email: email, password: 密碼 }, 不帶憑證: true });
  if (r && r.access_token) 設定憑證(r);
  return !!(r && r.access_token);
}

// 寄送重設密碼信
async function 寄重設密碼信(email) {
  await 請求("/auth/v1/recover?redirect_to=" + encodeURIComponent(回到網址()), { 方法: "POST", 內容: { email: email }, 不帶憑證: true });
}

// 修改目前登入者的密碼
async function 改密碼(新密碼) {
  await 請求("/auth/v1/user", { 方法: "PUT", 內容: { password: 新密碼 } });
}

// 取得目前登入的帳號資料
async function 取得帳號() {
  const u = await 請求("/auth/v1/user");
  連線.帳號 = { id: u.id, email: u.email };
  return 連線.帳號;
}

// 登出（通知伺服器並清除記憶體中的憑證）
async function 登出帳號() {
  try { await 請求("/auth/v1/logout", { 方法: "POST" }); } catch (e) { /* 已失效也沒關係 */ }
  清除登入();
}

// 清除記憶體中的登入資訊
function 清除登入() {
  clearTimeout(連線.計時器);
  連線.憑證 = ""; 連線.更新憑證 = ""; 連線.帳號 = null;
}

// 把篩選條件轉成網址參數：{欄: 值} → 欄=eq.值；值是陣列 → in.(…)
function 篩選參數(條件) {
  return Object.keys(條件 || {}).map(function (k) {
    const v = 條件[k];
    const 值 = Array.isArray(v) ? "in.(" + v.map(function (x) { return '"' + String(x).replace(/"/g, '\\"') + '"'; }).join(",") + ")" : "eq." + v;
    return encodeURIComponent(k) + "=" + encodeURIComponent(值);
  }).join("&");
}

// 讀資料表：查詢("members", {status: "有效"}, "member_no.asc")
function 查詢(表, 條件, 排序) {
  const 參 = ["select=*"];
  const 篩 = 篩選參數(條件);
  if (篩) 參.push(篩);
  if (排序) 參.push("order=" + encodeURIComponent(排序));
  return 請求("/rest/v1/" + 表 + "?" + 參.join("&"));
}

// 新增資料（可一次多筆），回傳新增後的資料
function 新增(表, 資料) {
  return 請求("/rest/v1/" + 表, { 方法: "POST", 內容: 資料, 標頭: { Prefer: "return=representation" } });
}

// 依條件修改資料，回傳修改後的資料
function 修改(表, 條件, 資料) {
  return 請求("/rest/v1/" + 表 + "?" + 篩選參數(條件), { 方法: "PATCH", 內容: 資料, 標頭: { Prefer: "return=representation" } });
}

// 依條件刪除資料
function 刪除(表, 條件) {
  return 請求("/rest/v1/" + 表 + "?" + 篩選參數(條件), { 方法: "DELETE", 標頭: { Prefer: "return=representation" } });
}

// 呼叫資料庫函式（RPC）
function 呼叫(函式, 參數) {
  return 請求("/rest/v1/rpc/" + 函式, { 方法: "POST", 內容: 參數 || {} });
}
