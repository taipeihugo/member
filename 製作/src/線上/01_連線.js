// 檔案說明：與 Supabase 連線（登入、註冊、忘記密碼、讀寫資料、呼叫資料庫函式）；登入資訊只放在記憶體，關掉頁面就清除

const 連線 = {
  網址: "",        // Supabase 專案網址（在 連線設定.js 填寫）
  金鑰: "",        // Supabase 公開金鑰（anon key，本身沒有讀取權限，資料由資料庫權限保護）
  憑證: "",        // 登入後的存取憑證（只在記憶體）
  更新憑證: "",    // 用來延長登入的憑證（只在記憶體）
  計時器: 0,
  到期: 0,         // 存取憑證到期的時間（毫秒）
  延長中: false,
  重試: 0,
  帳號: null       // {id, email}
};

// 讀取 連線設定.js 的內容；沒填好回傳 false
function 讀連線設定() {
  const 設 = window.PORTAL_CONFIG || {};
  連線.網址 = String(設.url || "").replace(/\/+$/, "");
  連線.金鑰 = String(設.anonKey || "");
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(連線.網址) && 連線.金鑰.length > 20;
}

// 發出一個網路請求並解析回應；失敗時丟出中文錯誤（錯誤物件帶有 狀態碼，網路不通時帶有 網路＝true）
// 選項.要標頭 為 true 時回傳 {資料, 標頭}（分頁讀取要看 Content-Range）
async function 請求(路徑, 選項) {
  選項 = 選項 || {};
  const 標頭 = Object.assign({ apikey: 連線.金鑰, "Content-Type": "application/json" }, 選項.標頭 || {});
  if (連線.憑證 && !選項.不帶憑證) 標頭.Authorization = "Bearer " + 連線.憑證;
  let 回應;
  try {
    回應 = await fetch(連線.網址 + 路徑, { method: 選項.方法 || "GET", headers: 標頭, body: 選項.內容 === undefined ? undefined : JSON.stringify(選項.內容) });
  } catch (e) {
    const 錯 = new Error("無法連線，請檢查網路");
    錯.網路 = true;
    throw 錯;
  }
  const 文字 = await 回應.text();
  let 資料 = null;
  try { 資料 = 文字 ? JSON.parse(文字) : null; } catch (e) { 資料 = 文字; }
  if (!回應.ok) {
    const 錯 = new Error(翻譯錯誤(資料, 回應.status));
    錯.狀態碼 = 回應.status;
    錯.代碼 = (資料 && (資料.error_code || 資料.code)) || "";
    throw 錯;
  }
  return 選項.要標頭 ? { 資料: 資料, 標頭: 回應.headers } : 資料;
}

// 把伺服器的錯誤訊息轉成看得懂的中文（同時比對訊息與錯誤代碼）
function 翻譯錯誤(資料, 狀態碼) {
  const 原文 = (資料 && (資料.message || 資料.error_description || 資料.msg || 資料.error)) || "";
  const 比對 = 原文 + " " + ((資料 && (資料.error_code || 資料.code)) || "");
  const 對照 = [
    [/Invalid login credentials|invalid_credentials/i, "Email 或密碼不正確"],
    [/Email not confirmed|email_not_confirmed/i, "Email 尚未驗證，請先到信箱點驗證連結"],
    [/User already registered|user_already_exists/i, "這個 Email 已經註冊過了，請直接登入或使用「忘記密碼」"],
    [/email_address_not_authorized|not authorized/i, "協會尚未完成寄信設定，暫時無法寄送驗證信，請洽協會幹部"],
    [/over_email_send_rate_limit|email rate limit/i, "寄信次數已達上限，請過一段時間再試，或洽協會幹部"],
    [/Error sending|smtp/i, "寄信失敗，請稍後再試或洽協會幹部"],
    [/otp_expired|link is invalid or has expired/i, "連結已失效，請重新寄送"],
    [/signup_disabled|Signups not allowed/i, "目前不開放註冊，請洽協會"],
    [/email_address_invalid|Unable to validate email|invalid format/i, "Email 格式不正確"],
    [/weak_password|Password should be at least/i, "密碼強度不足（至少 8 個字元）"],
    [/All object keys must match/i, "匯入資料的欄位不一致，請重新整理後再試"],
    [/rate limit|too many/i, "操作太頻繁，請稍後再試"],
    [/JWT expired/i, "登入已逾時，請重新登入"],
    [/row-level security|permission denied/i, "沒有權限執行這個動作"],
    [/duplicate key.*members_email/i, "已有相同 Email 的會員"],
    [/duplicate key/i, "資料重複"],
    [/members_board_title_ok/i, "理監事職稱與身分不符（理事、監事只能擇一）"]
  ];
  for (const [規則, 中文] of 對照) if (規則.test(比對)) return 中文;
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
  連線.到期 = Date.now() + (Number(r.expires_in) || 3600) * 1000;
  連線.重試 = 0;
  排程延長();
}

// 安排下一次延長登入（預設在到期前 2 分鐘；可指定幾毫秒後）
function 排程延長(毫秒) {
  clearTimeout(連線.計時器);
  const 等 = 毫秒 != null ? 毫秒 : Math.max(60000, 連線.到期 - Date.now() - 120000);
  連線.計時器 = setTimeout(延長登入, 等);
}

// 用更新憑證延長登入；網路暫時不通就稍後重試，伺服器拒絕才回到登入畫面
async function 延長登入() {
  if (!連線.更新憑證 || 連線.延長中) return;
  const 這次 = 連線.更新憑證;
  連線.延長中 = true;
  try {
    const r = await 請求("/auth/v1/token?grant_type=refresh_token", { 方法: "POST", 內容: { refresh_token: 這次 }, 不帶憑證: true });
    if (連線.更新憑證 !== 這次) return;   // 這段期間已經登出或換人登入
    設定憑證(r);
  } catch (e) {
    if (連線.更新憑證 !== 這次) return;
    if (e.網路 && 連線.重試 < 6) {
      連線.重試++;
      提示("網路暫時中斷，稍後自動重新連線");
      排程延長(8000);
      return;
    }
    清除登入();
    提示("登入已逾時，請重新登入", true);
    顯示登入頁();
  } finally {
    連線.延長中 = false;
  }
}

// 電腦從休眠喚醒或網路恢復時：憑證快到期（或已到期）就立刻延長
function 檢查到期() {
  if (連線.更新憑證 && 連線.到期 - Date.now() < 180000) 延長登入();
}
window.addEventListener("online", 檢查到期);
document.addEventListener("visibilitychange", function () { if (!document.hidden) 檢查到期(); });

// 註冊新帳號；回傳 "已寄信"（請收驗證信）、"已註冊"（這個 Email 早就註冊過）或 "已登入"（未開啟 Email 驗證）
async function 註冊帳號(email, 密碼) {
  const r = await 請求("/auth/v1/signup?redirect_to=" + encodeURIComponent(回到網址()), { 方法: "POST", 內容: { email: email, password: 密碼 }, 不帶憑證: true });
  if (r && r.access_token) { 設定憑證(r); return "已登入"; }
  const 使用者 = r && (r.user || r);
  // 開啟 Email 驗證時，已註冊的 Email 會收到一個沒有身分資料的假回應（不寄信、也不報錯）
  if (使用者 && Array.isArray(使用者.identities) && 使用者.identities.length === 0) return "已註冊";
  return "已寄信";
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

// 清除記憶體中的登入資訊，並讓還在讀取中的畫面作廢、關掉開著的對話框
function 清除登入() {
  clearTimeout(連線.計時器);
  連線.憑證 = ""; 連線.更新憑證 = ""; 連線.帳號 = null; 連線.到期 = 0; 連線.重試 = 0;
  狀態.導覽序 = (狀態.導覽序 || 0) + 1;
  狀態.目前頁 = "";
  狀態.頁參數 = null;
  document.querySelectorAll("dialog[open]").forEach(function (d) { d.close(); });
  清空(document.getElementById("列印區"));
}

// 把篩選條件轉成網址參數：{欄: 值} → 欄=eq.值；值是陣列 → in.(…)
function 篩選參數(條件) {
  return Object.keys(條件 || {}).map(function (k) {
    const v = 條件[k];
    const 值 = Array.isArray(v) ? "in.(" + v.map(function (x) { return '"' + String(x).replace(/"/g, '\\"') + '"'; }).join(",") + ")" : "eq." + v;
    return encodeURIComponent(k) + "=" + encodeURIComponent(值);
  }).join("&");
}

// 讀資料表：查詢("members", {status: "有效"}, "member_no.asc")。
// 分頁讀完全部資料（Supabase 一次最多回 1000 筆，超過的部分不會報錯，只會被截掉）；排序最後加上 id，分頁才不會重複或漏掉
async function 查詢(表, 條件, 排序) {
  const 參 = ["select=*"];
  const 篩 = 篩選參數(條件);
  if (篩) 參.push(篩);
  參.push("order=" + encodeURIComponent((排序 ? 排序 + "," : "") + "id.asc"));
  const 每頁 = 1000;
  let 全部 = [];
  let 總數 = null;
  for (let 次 = 0; 次 < 1000; 次++) {
    const r = await 請求("/rest/v1/" + 表 + "?" + 參.join("&") + "&limit=" + 每頁 + "&offset=" + 全部.length, { 標頭: { Prefer: "count=exact" }, 要標頭: true });
    const 頁 = Array.isArray(r.資料) ? r.資料 : [];
    全部 = 全部.concat(頁);
    const 範圍 = /\/(\d+)\s*$/.exec((r.標頭 && r.標頭.get("Content-Range")) || "");
    if (範圍) 總數 = Number(範圍[1]);
    if (!頁.length || (總數 != null && 全部.length >= 總數)) break;
  }
  return 全部;
}

// 新增資料（可一次多筆），回傳新增後的資料。
// 一次多筆時每筆的欄位必須一致（Supabase 規定），所以先把缺的欄位補上空值（依該欄其他筆的型態：文字補空字串、是非補否）
function 新增(表, 資料) {
  if (Array.isArray(資料) && 資料.length > 1) {
    const 空值 = {};
    資料.forEach(function (r) {
      Object.keys(r).forEach(function (k) {
        if (k in 空值) return;
        空值[k] = typeof r[k] === "boolean" ? false : typeof r[k] === "number" ? 0 : r[k] === null ? null : "";
      });
    });
    資料 = 資料.map(function (r) {
      const 補 = {};
      Object.keys(空值).forEach(function (k) { 補[k] = k in r ? r[k] : 空值[k]; });
      return 補;
    });
  }
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
