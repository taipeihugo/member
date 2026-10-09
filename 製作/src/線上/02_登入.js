// 檔案說明：登入、註冊、忘記密碼、重設密碼畫面；登入後連結會員資料並決定能用哪些功能

const 線上 = {
  會員: null,      // 自己的會員資料（members 一筆）；還不是會員時為 null
  幹部: "",        // 幹部角色（例如理事長、秘書長、總幹事、會計、承辦人）；一般會員為空字串
  申請: null,      // 最近一次入會申請（還不是會員時用）
  連結申請: null,  // 最近一次帳號連結申請（還沒連結會員資料時用）
  角色們: [],      // 系統設定的幹部角色 [{name, is_admin, sort}]
  職稱們: [],      // 系統設定的理監事職稱 [{title, board_role, sort, max_count, candidate}]
  組名額: {},      // 理監事組的人數上限 {理事: 15, 監事: 5}（資料庫 board_limits；沒有資料時不顯示上限）
  設定已讀: false,  // 已讀過系統設定（清單可能是空的，也照用）
  資料庫提醒: ""     // 資料庫結構不是這一版需要的版本時，給幹部看的提醒（空字串＝沒問題）
};

// 這一版網頁需要的資料庫結構版本（與 線上系統/資料庫結構.sql 的 db_version() 一致；SQL 有改時兩邊一起改）
const 需要資料庫版本 = "2.7";

// 資料庫還沒更新到有「系統設定」時用的預設清單
const 預設角色們 = [{ name: "理事長", is_admin: true }, { name: "秘書長", is_admin: true }, { name: "總幹事", is_admin: true }, { name: "會計", is_admin: false }, { name: "承辦人", is_admin: false }];
const 預設職稱們 = [{ title: "理事長", board_role: "理事" }, { title: "常務理事", board_role: "理事" }, { title: "理事", board_role: "理事" },
  { title: "監事會召集人", board_role: "監事" }, { title: "常務監事", board_role: "監事" }, { title: "監事", board_role: "監事" }];

// 是否為幹部
function 是幹部() {
  return !!線上.幹部;
}

// 是否為具管理權限的幹部（可指派幹部角色、建立登入帳號、修改系統設定；預設是理事長、秘書長、總幹事）
function 是管理者() {
  const 角 = 線上.角色們.find(function (r) { return r.name === 線上.幹部; });
  return !!(線上.幹部 && 角 && 角.is_admin);
}

// 讀取系統設定（幹部角色、理監事職稱）；只有資料庫還沒更新（沒有這兩張表，回 404）時才用預設清單，其他錯誤照樣丟出
async function 讀取系統設定() {
  const 場 = 連線.場次;
  let 角 = 預設角色們, 職 = 預設職稱們, 組 = [];
  try {
    [角, 職] = await Promise.all([查詢("staff_roles", null, "sort.asc", "name"), 查詢("board_titles", null, "sort.asc", "title")]);
  } catch (e) {
    if (e.狀態碼 !== 404) throw e;
  }
  // 理監事組的人數上限（v2.4）：資料庫還沒更新時沒有這張表，就不顯示上限
  try { 組 = await 查詢("board_limits", null, null, "board_role"); } catch (e) { if (e.狀態碼 !== 404) throw e; }
  const 提醒 = await 檢查資料庫版本();
  // 讀取期間登出或換人登入：不要蓋掉下一位的設定
  if (連線.場次 !== 場) return;
  const 名額 = {};
  組.forEach(function (x) { 名額[x.board_role] = x.max_count; });
  線上.角色們 = 角; 線上.職稱們 = 職; 線上.組名額 = 名額; 線上.設定已讀 = true; 線上.資料庫提醒 = 提醒;
}

// 比對資料庫結構版本：回傳給幹部看的提醒文字（沒問題或讀不到時回空字串，不影響登入）
async function 檢查資料庫版本() {
  let 版 = "";
  try { 版 = String(await 呼叫("db_version") || ""); }
  catch (e) { if (e.狀態碼 === 404) 版 = "舊版"; else return ""; }
  if (版 === 需要資料庫版本) return "";
  if (版 !== "舊版" && Number(版) > Number(需要資料庫版本)) return "這個網頁是舊版（資料庫已經是 v" + 版 + "）。請重新整理頁面（按 Ctrl＋F5），再不行請清除瀏覽器快取。";
  return "資料庫還沒更新到這一版（網頁需要 v" + 需要資料庫版本 + "，資料庫是" + (版 === "舊版" ? "較舊的版本" : " v" + 版) + "），退會申請、理監事名額等功能會失敗。請具管理權限的人到 Supabase 的 SQL Editor，貼上最新的「線上系統/資料庫結構.sql」全文並執行一次，再重新登入。";
}

// 建立置中的卡片畫面（登入、註冊等用）
function 置中卡片(標題, 內容們) {
  const 內容 = 清空(document.getElementById("內容"));
  內容.appendChild(h("div", { class: "歡迎" },
    h("img", { class: "會徽大", src: 會徽網址(), alt: "協會會徽" }),
    h("h1", null, 標題),
    h("div", { class: "卡" }, 內容們)));
}

// 會徽圖片網址（沿用網頁小圖示）
function 會徽網址() {
  const el = document.querySelector('link[rel="icon"]');
  return el ? el.getAttribute("href") : "";
}

// 建立一個有標籤的輸入欄
function 輸入欄(標題, 屬性) {
  const 欄 = h("input", 屬性);
  return { 欄: 欄, 元素: h("div", { class: "欄" }, h("span", null, h("label", { for: 屬性.id }, 標題)), 欄) };
}

// 顯示登入畫面
function 顯示登入頁(訊息) {
  線上.會員 = null; 線上.幹部 = ""; 線上.申請 = null; 線上.角色們 = []; 線上.職稱們 = []; 線上.組名額 = {}; 線上.設定已讀 = false; 線上.資料庫提醒 = "";
  更新外框();
  const 信 = 輸入欄("Email", { id: "登入信箱", type: "email", autocomplete: "username" });
  const 密 = 輸入欄("密碼", { id: "登入密碼", type: "password", autocomplete: "current-password" });
  const 錯 = h("p", { class: "錯誤", role: "alert" }, 訊息 || "");
  const 送出 = async function () {
    錯.textContent = "登入中…";
    try {
      await 登入帳號(信.欄.value.trim(), 密.欄.value);
      錯.textContent = "";
      await 登入後();
    } catch (e) { 錯.textContent = e.message; }
  };
  密.欄.addEventListener("keydown", function (e) { if (e.key === "Enter") 送出(); });
  置中卡片("會員專區登入", [
    h("div", { class: "表單" }, 信.元素, 密.元素), 錯,
    h("div", { class: "表工具列" },
      h("button", { class: "鈕 主", type: "button", id: "登入鈕", onclick: 送出 }, "登入"),
      h("button", { class: "鈕 文字", type: "button", onclick: 顯示註冊頁 }, "第一次使用？註冊帳號"),
      h("button", { class: "鈕 文字", type: "button", onclick: 顯示忘記密碼頁 }, "忘記密碼")),
    h("p", { class: "小字 次要字" }, "協會替您建立的帳號，直接用協會給您的 Email 與密碼登入（登入後可在「我的資料」修改密碼）。自己註冊請用收得到外部信的個人 Email；註冊登入後送出「連結申請」，協會核對後就能連到名冊上的會員資料；還不是會員的同仁可線上申請入會。為保護個資，登入資訊不會留在瀏覽器，重新整理頁面需要重新登入。")
  ]);
  信.欄.focus();
}

// 顯示註冊畫面
function 顯示註冊頁() {
  const 信 = 輸入欄("個人 Email（收得到外部信的信箱）", { id: "註冊信箱", type: "email", autocomplete: "username" });
  const 密 = 輸入欄("密碼（至少 6 個字元）", { id: "註冊密碼", type: "password", autocomplete: "new-password" });
  const 再 = 輸入欄("再輸入一次密碼", { id: "註冊再次", type: "password", autocomplete: "new-password" });
  const 錯 = h("div", { role: "alert" });
  置中卡片("註冊帳號", [
    h("div", { class: "表單" }, 信.元素, 密.元素, 再.元素), 錯,
    h("div", { class: "表工具列" },
      h("button", { class: "鈕 主", type: "button", id: "註冊鈕", onclick: async function () {
        清空(錯);
        const email = 信.欄.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 錯.appendChild(h("p", { class: "錯誤" }, "Email 格式不正確"));
        if (密.欄.value.length < 6) return 錯.appendChild(h("p", { class: "錯誤" }, "密碼至少 6 個字元"));
        if (密.欄.value !== 再.欄.value) return 錯.appendChild(h("p", { class: "錯誤" }, "兩次輸入的密碼不一樣"));
        try {
          const 結果 = await 註冊帳號(email, 密.欄.value);
          if (結果 === "已登入") return 登入後();
          if (結果 === "已註冊") {
            置中卡片("這個 Email 已經註冊過了", [
              h("p", null, email + " 已經註冊並完成驗證，請直接登入。忘記密碼可以用「忘記密碼」重設。"),
              h("div", { class: "表工具列" },
                h("button", { class: "鈕 主", type: "button", onclick: function () { 顯示登入頁(); } }, "去登入"),
                h("button", { class: "鈕", type: "button", onclick: 顯示忘記密碼頁 }, "忘記密碼"))]);
            return;
          }
          置中卡片("請到信箱收驗證信", [
            h("p", null, "驗證信已寄到 " + email + "，請點信中的連結完成驗證，再回來登入。"),
            h("p", { class: "小字 次要字" }, "沒收到？請看垃圾郵件匣，或幾分鐘後再試。如果您之前已經註冊過，請直接登入或使用「忘記密碼」。"),
            h("button", { class: "鈕 主", type: "button", onclick: function () { 顯示登入頁(); } }, "回登入畫面")]);
        } catch (e) { 錯.appendChild(h("p", { class: "錯誤" }, e.message)); }
      } }, "註冊"),
      h("button", { class: "鈕 文字", type: "button", onclick: function () { 顯示登入頁(); } }, "已有帳號，回登入"))
  ]);
  信.欄.focus();
}

// 顯示忘記密碼畫面
function 顯示忘記密碼頁() {
  const 信 = 輸入欄("註冊時用的 Email", { id: "忘記信箱", type: "email" });
  const 訊 = h("div", { role: "status" });
  置中卡片("忘記密碼", [
    h("div", { class: "表單" }, 信.元素), 訊,
    h("div", { class: "表工具列" },
      h("button", { class: "鈕 主", type: "button", onclick: async function () {
        清空(訊);
        try {
          await 寄重設密碼信(信.欄.value.trim());
          訊.appendChild(h("p", { class: "提醒" }, "如果這個 Email 有註冊，重設密碼信已寄出，請點信中的連結設定新密碼。"));
        } catch (e) { 訊.appendChild(h("p", { class: "錯誤" }, e.message)); }
      } }, "寄重設密碼信"),
      h("button", { class: "鈕 文字", type: "button", onclick: function () { 顯示登入頁(); } }, "回登入"))
  ]);
}

// 從重設密碼信的連結回來：設定新密碼。畫面明顯標出是哪個帳號；設定完要用新密碼重新登入
function 顯示設定新密碼頁() {
  const 密 = 輸入欄("新密碼（至少 6 個字元）", { id: "新密碼", type: "password", autocomplete: "new-password" });
  const 再 = 輸入欄("再輸入一次", { id: "新密碼再次", type: "password", autocomplete: "new-password" });
  const 錯 = h("p", { class: "錯誤", role: "alert" });
  置中卡片("設定新密碼", [
    h("p", { class: "提醒" }, "正在為 " + (連線.帳號 ? 連線.帳號.email : "") + " 設定新密碼。如果這不是您的 Email，請直接關閉這個頁面。"),
    h("div", { class: "表單" }, 密.元素, 再.元素), 錯,
    h("button", { class: "鈕 主", type: "button", id: "儲存新密碼鈕", onclick: async function () {
      if (密.欄.value.length < 6) return (錯.textContent = "密碼至少 6 個字元");
      if (密.欄.value !== 再.欄.value) return (錯.textContent = "兩次輸入的密碼不一樣");
      try {
        await 改密碼(密.欄.value);
        await 登出帳號();
        顯示登入頁("密碼已更新，請用新密碼登入");
      } catch (e) { 錯.textContent = e.message; }
    } }, "儲存新密碼")
  ]);
}

// 處理信中連結帶回來的結果（網址 # 或 ? 後面），處理完就從網址列移除。
// 為防止有人把「自己的登入憑證」做成連結騙別人點（之後送出的申請就會記在對方帳號），
// 驗證信連結一律不直接登入，只告知驗證完成、請用密碼登入；只有重設密碼連結會暫時使用憑證來設定新密碼。
async function 處理信件連結() {
  const 參 = new URLSearchParams(location.hash.replace(/^#/, ""));
  const 查 = new URLSearchParams(location.search);
  const 錯誤說明 = 參.get("error_description") || 查.get("error_description");
  if (錯誤說明) {
    history.replaceState(null, "", 回到網址());
    const 代碼 = 參.get("error_code") || 查.get("error_code") || "";
    顯示登入頁(/otp_expired/.test(代碼) ? "連結已失效（可能已用過或超過時間），請重新寄送" : "連結無效：" + 錯誤說明);
    return true;
  }
  if (!參.get("access_token")) return false;
  const 類型 = 參.get("type");
  history.replaceState(null, "", 回到網址());
  if (類型 !== "recovery") {
    顯示登入頁("Email 驗證完成，請用 Email 與密碼登入");
    return true;
  }
  連線.場次++;
  設定憑證({ access_token: 參.get("access_token"), refresh_token: 參.get("refresh_token"), expires_in: 參.get("expires_in") });
  try { await 取得帳號(); } catch (e) { 清除登入(); 顯示登入頁(e.message); return true; }
  顯示設定新密碼頁();
  return true;
}

// 登入後：讀取自己的會員資料與幹部角色、申請狀態，然後進首頁
async function 登入後() {
  try {
    if (!連線.帳號) await 取得帳號();
    await 讀取系統設定();
    await 重新讀取我的資料();
    更新外框();
    前往(線上.會員 ? "我的資料" : "連結會員資料");
  } catch (e) {
    清除登入();
    顯示登入頁(e.message);
  }
}

// 重新讀取自己的會員資料、幹部角色與入會申請
async function 重新讀取我的資料() {
  const 我 = await 查詢("members", { user_id: 連線.帳號.id });
  線上.會員 = 我[0] || null;
  線上.幹部 = 線上.會員 && 線上.會員.status === "有效" ? 線上.會員.staff_role || "" : "";
  if (!線上.會員) {
    const [申, 連] = await Promise.all([查詢("applications", { user_id: 連線.帳號.id }, "created_at.desc"), 查詢("link_requests", { user_id: 連線.帳號.id }, "created_at.desc")]);
    線上.申請 = 申[0] || null;
    線上.連結申請 = 連[0] || null;
  }
}

// 登出並回到登入畫面（先清掉畫面與記憶體中的資料，再通知伺服器）
async function 登出() {
  const 舊憑證 = 連線.憑證;
  清除登入();
  顯示登入頁("已登出");
  if (舊憑證) {
    try { await 請求("/auth/v1/logout", { 方法: "POST", 標頭: { Authorization: "Bearer " + 舊憑證 }, 不帶憑證: true }); } catch (e) { /* 已失效也沒關係 */ }
  }
}
