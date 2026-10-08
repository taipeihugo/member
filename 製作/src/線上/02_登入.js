// 檔案說明：登入、註冊、忘記密碼、重設密碼畫面；登入後連結會員資料並決定能用哪些功能

const 線上 = {
  會員: null,      // 自己的會員資料（members 一筆）；還不是會員時為 null
  幹部: "",        // 幹部角色：理事長、秘書長、會計、承辦人；一般會員為空字串
  申請: null,      // 最近一次入會申請（還不是會員時用）
  連結申請: null   // 最近一次帳號連結申請（還沒連結會員資料時用）
};

// 是否為幹部
function 是幹部() {
  return !!線上.幹部;
}

// 是否可指派幹部角色（理事長、秘書長）
function 是管理者() {
  return 線上.幹部 === "理事長" || 線上.幹部 === "秘書長";
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
  線上.會員 = null; 線上.幹部 = ""; 線上.申請 = null;
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
    h("p", { class: "小字 次要字" }, "請用您的個人 Email 註冊（公務信箱收不到外部驗證信）。註冊登入後，輸入協會給您的「認領碼」或送出「連結申請」，就能連到名冊上的會員資料；還不是會員的同仁可線上申請入會。為保護個資，登入資訊不會留在瀏覽器，重新整理頁面需要重新登入。")
  ]);
  信.欄.focus();
}

// 顯示註冊畫面
function 顯示註冊頁() {
  const 信 = 輸入欄("個人 Email（收得到外部信的信箱）", { id: "註冊信箱", type: "email", autocomplete: "username" });
  const 密 = 輸入欄("密碼（至少 8 個字元）", { id: "註冊密碼", type: "password", autocomplete: "new-password" });
  const 再 = 輸入欄("再輸入一次密碼", { id: "註冊再次", type: "password", autocomplete: "new-password" });
  const 錯 = h("div", { role: "alert" });
  置中卡片("註冊帳號", [
    h("div", { class: "表單" }, 信.元素, 密.元素, 再.元素), 錯,
    h("div", { class: "表工具列" },
      h("button", { class: "鈕 主", type: "button", id: "註冊鈕", onclick: async function () {
        清空(錯);
        const email = 信.欄.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 錯.appendChild(h("p", { class: "錯誤" }, "Email 格式不正確"));
        if (密.欄.value.length < 8) return 錯.appendChild(h("p", { class: "錯誤" }, "密碼至少 8 個字元"));
        if (密.欄.value !== 再.欄.value) return 錯.appendChild(h("p", { class: "錯誤" }, "兩次輸入的密碼不一樣"));
        try {
          const 已登入 = await 註冊帳號(email, 密.欄.value);
          if (已登入) return 登入後();
          置中卡片("請到信箱收驗證信", [
            h("p", null, "驗證信已寄到 " + email + "，請點信中的連結完成驗證，再回來登入。"),
            h("p", { class: "小字 次要字" }, "沒收到？請看垃圾郵件匣，或幾分鐘後再試。"),
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

// 從信中連結回來：設定新密碼
function 顯示設定新密碼頁() {
  const 密 = 輸入欄("新密碼（至少 8 個字元）", { id: "新密碼", type: "password", autocomplete: "new-password" });
  const 再 = 輸入欄("再輸入一次", { id: "新密碼再次", type: "password", autocomplete: "new-password" });
  const 錯 = h("p", { class: "錯誤", role: "alert" });
  置中卡片("設定新密碼", [
    h("div", { class: "表單" }, 密.元素, 再.元素), 錯,
    h("button", { class: "鈕 主", type: "button", onclick: async function () {
      if (密.欄.value.length < 8) return (錯.textContent = "密碼至少 8 個字元");
      if (密.欄.value !== 再.欄.value) return (錯.textContent = "兩次輸入的密碼不一樣");
      try { await 改密碼(密.欄.value); 提示("密碼已更新"); await 登入後(); } catch (e) { 錯.textContent = e.message; }
    } }, "儲存新密碼")
  ]);
}

// 處理信中連結帶回來的憑證（網址 # 後面），處理完就從網址列移除
async function 處理信件連結() {
  const 參 = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (參.get("error_description")) {
    history.replaceState(null, "", 回到網址());
    顯示登入頁("連結無效或已過期：" + 參.get("error_description"));
    return true;
  }
  if (!參.get("access_token")) return false;
  const 類型 = 參.get("type");
  設定憑證({ access_token: 參.get("access_token"), refresh_token: 參.get("refresh_token"), expires_in: 參.get("expires_in") });
  history.replaceState(null, "", 回到網址());
  try { await 取得帳號(); } catch (e) { 顯示登入頁(e.message); return true; }
  if (類型 === "recovery") 顯示設定新密碼頁();
  else { 提示("Email 驗證完成"); await 登入後(); }
  return true;
}

// 登入後：連結名冊、讀取自己的會員資料與幹部角色、入會申請狀態，然後進首頁
async function 登入後() {
  try {
    if (!連線.帳號) await 取得帳號();
    await 呼叫("link_my_member");
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

// 登出並回到登入畫面
async function 登出() {
  await 登出帳號();
  顯示登入頁("已登出");
}
