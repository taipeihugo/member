// 檔案說明：開始畫面、第一次建立協會資料、登入（密碼以 PBKDF2 雜湊保存）、登出、改密碼

const 雜湊次數 = 310000;

// 位元組轉十六進位文字
function 轉十六進位(位元組) {
  return Array.from(new Uint8Array(位元組), function (b) { return 補零(b.toString(16)); }).join("");
}

// 十六進位文字轉位元組
function 十六進位轉位元組(hex) {
  const 結果 = new Uint8Array(hex.length / 2);
  for (let i = 0; i < 結果.length; i++) 結果[i] = parseInt(hex.substr(i * 2, 2), 16);
  return 結果;
}

// 用 PBKDF2（SHA-256）把密碼加鹽雜湊，回傳十六進位文字
async function 雜湊密碼(密碼, 鹽hex, 次數) {
  const 金鑰 = await crypto.subtle.importKey("raw", new TextEncoder().encode(密碼), "PBKDF2", false, ["deriveBits"]);
  const 位元 = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: 十六進位轉位元組(鹽hex), iterations: 次數, hash: "SHA-256" }, 金鑰, 256);
  return 轉十六進位(位元);
}

// 為一個密碼產生新的鹽與雜湊值（存進使用者紀錄）
async function 產生密碼紀錄(密碼) {
  const 鹽 = new Uint8Array(16);
  crypto.getRandomValues(鹽);
  const 鹽hex = 轉十六進位(鹽);
  return { 鹽: 鹽hex, 次數: 雜湊次數, 雜湊: await 雜湊密碼(密碼, 鹽hex, 雜湊次數) };
}

// 檢查密碼是否正確
async function 驗證密碼(使用者, 密碼) {
  if (!使用者 || !使用者.鹽 || !使用者.雜湊) return false;
  const 算出 = await 雜湊密碼(密碼, 使用者.鹽, 使用者.次數 || 雜湊次數);
  // 逐字比對全部字元，避免因比對時間不同洩漏資訊
  let 差 = 算出.length ^ 使用者.雜湊.length;
  for (let i = 0; i < 算出.length; i++) 差 |= 算出.charCodeAt(i) ^ (使用者.雜湊.charCodeAt(i) || 0);
  return 差 === 0;
}

// 密碼強度檢查：至少 8 個字元；回傳錯誤訊息或空字串
function 檢查密碼(密碼, 再次) {
  if (String(密碼).length < 8) return "密碼至少要 8 個字元";
  if (再次 != null && 密碼 !== 再次) return "兩次輸入的密碼不一樣";
  return "";
}

// 顯示開始畫面：選協會資料夾（或不支援時開啟資料檔）
function 顯示開始畫面() {
  狀態.資料 = null;
  狀態.使用者 = null;
  更新外框();
  const 內容 = 清空(document.getElementById("內容"));
  const 區 = h("div", { class: "歡迎" },
    h("img", { class: "會徽大", src: 會徽網址(), alt: "協會會徽" }),
    h("h1", null, "會務管理系統"),
    h("p", { class: "置中 次要字" }, "版本 " + 版本 + "　｜　完全離線，資料只存在您選的資料夾"));
  const 卡 = h("div", { class: "卡" });
  if (支援資料夾()) {
    卡.appendChild(h("h2", null, "開始使用"));
    卡.appendChild(h("p", null, "請選擇「協會資料夾」（例如共用磁碟上的 協會會務 資料夾）。系統會在裡面讀寫 協會資料.json、附件 與 備份 資料夾。"));
    卡.appendChild(h("button", { class: "鈕 主", type: "button", id: "選資料夾鈕", onclick: 按選資料夾 }, "選擇協會資料夾"));
  } else {
    卡.appendChild(h("h2", null, "開始使用（單檔模式）"));
    卡.appendChild(h("p", null, "這個瀏覽器不支援選資料夾功能，改用單檔模式：開啟協會資料.json，存檔時會下載新的資料檔，請自行放回原位置覆蓋。建議改用 Microsoft Edge。"));
    卡.appendChild(h("div", { class: "表工具列" },
      h("button", { class: "鈕 主", type: "button", onclick: 按開啟資料檔 }, "開啟資料檔"),
      h("button", { class: "鈕", type: "button", onclick: function () { 建立新協會(null); } }, "建立新的資料檔")));
  }
  卡.appendChild(h("p", { class: "提醒" }, "資料夾的存取權限請由資訊單位設定（只開放給協會幹部）。本系統的登入與角色只控制畫面上能做什麼，不能取代資料夾權限。"));
  區.appendChild(卡);
  內容.appendChild(區);
}

// 取得會徽圖片網址（沿用網頁小圖示）
function 會徽網址() {
  const el = document.querySelector('link[rel="icon"]');
  return el ? el.getAttribute("href") : "";
}

// 按下「選擇協會資料夾」
async function 按選資料夾() {
  try {
    const 資料 = await 選擇資料夾();
    if (資料) 載入資料(資料);
    else 建立新協會(狀態.資料夾);
  } catch (e) {
    if (e && e.name === "AbortError") return;
    提示("無法開啟資料夾：" + e.message, true);
  }
}

// 按下「開啟資料檔」（單檔模式）
async function 按開啟資料檔() {
  try {
    const 資料 = await 開啟資料檔();
    if (資料) 載入資料(資料);
  } catch (e) {
    提示("無法讀取資料檔：" + e.message, true);
  }
}

// 讀入資料後：記下基準，顯示登入畫面
function 載入資料(資料) {
  狀態.資料 = 資料;
  狀態.基準 = 深拷貝(資料);
  狀態.未存 = false;
  顯示登入畫面();
}

// 第一次使用：建立新的協會資料（協會名稱＋第一位管理者）
function 建立新協會(夾) {
  const 內容 = 清空(document.getElementById("內容"));
  const 欄位們 = [
    { key: "協會名稱", 標題: "協會名稱", 必填: true, 預設: "財政部公務人員協會", 寬: true },
    { key: "姓名", 標題: "您的姓名", 必填: true },
    { key: "角色", 標題: "您的角色", 類型: "選單", 選項: ["理事長", "秘書長"], 必填: true, 預設: "秘書長" },
    { key: "密碼", 標題: "密碼（至少 8 個字元）", 類型: "密碼", 必填: true },
    { key: "再次", 標題: "再輸入一次密碼", 類型: "密碼", 必填: true }
  ];
  const 表單 = h("form", { class: "表單", onsubmit: function (e) { e.preventDefault(); } }, 欄位們.map(function (f) { return 表單欄位(f, f.預設); }));
  const 錯誤區 = h("p", { class: "錯誤", role: "alert" });
  const 送出 = async function () {
    const 值 = 讀表單(表單, 欄位們);
    if (!值.協會名稱 || !值.姓名) { 錯誤區.textContent = "請填寫協會名稱與姓名"; return; }
    const 錯 = 檢查密碼(值.密碼, 值.再次);
    if (錯) { 錯誤區.textContent = 錯; return; }
    const 資料 = 空白資料(值.協會名稱);
    狀態.資料 = 資料;
    狀態.基準 = null;
    const 密 = await 產生密碼紀錄(值.密碼);
    const 使用者 = 新增紀錄("使用者", Object.assign({ 姓名: 值.姓名, 角色: 值.角色, 停用: false }, 密));
    狀態.使用者 = 使用者;
    記錄操作("建立", "協會資料", "建立新的協會資料檔");
    if (夾) {
      狀態.基準 = { 設定: {} };
      await 存檔();
    } else {
      狀態.模式 = "單檔";
      標記未存();
    }
    登入完成(使用者);
  };
  內容.appendChild(h("div", { class: "歡迎" },
    h("img", { class: "會徽大", src: 會徽網址(), alt: "協會會徽" }),
    h("h1", null, "建立協會資料"),
    h("div", { class: "卡" },
      h("p", null, 夾 ? "這個資料夾還沒有協會資料，請先建立第一位管理者。" : "建立新的協會資料檔（存檔時會下載）。"),
      表單, 錯誤區,
      h("button", { class: "鈕 主", type: "button", id: "建立鈕", onclick: 送出 }, "建立並登入"))));
}

// 顯示登入畫面：選自己的名字＋輸入密碼
function 顯示登入畫面() {
  更新外框();
  const 內容 = 清空(document.getElementById("內容"));
  const 使用者們 = 集合("使用者").filter(function (u) { return !u.停用; })
    .sort(function (a, b) { return 比較(a.姓名, b.姓名); });
  const 選 = h("select", { id: "登入姓名" }, 使用者們.map(function (u) { return h("option", { value: u.id }, u.姓名 + "（" + u.角色 + "）"); }));
  const 密 = h("input", { type: "password", id: "登入密碼", autocomplete: "current-password" });
  const 錯誤區 = h("p", { class: "錯誤", role: "alert" });
  const 送出 = async function () {
    const u = 找("使用者", 選.value);
    錯誤區.textContent = "驗證中…";
    if (await 驗證密碼(u, 密.value)) {
      錯誤區.textContent = "";
      記錄操作("登入", "系統", u.姓名 + " 登入");
      登入完成(u);
    } else {
      錯誤區.textContent = "密碼不正確";
      密.select();
    }
  };
  密.addEventListener("keydown", function (e) { if (e.key === "Enter") 送出(); });
  內容.appendChild(h("div", { class: "歡迎" },
    h("img", { class: "會徽大", src: 會徽網址(), alt: "協會會徽" }),
    h("h1", null, 狀態.資料.設定.協會名稱),
    狀態.資料.設定.範例資料 ? h("p", { class: "範例條" }, "這是範例資料（人名、電話、Email、金額全部虛構）") : null,
    h("div", { class: "卡" },
      h("div", { class: "表單" },
        h("div", { class: "欄" }, h("span", null, h("label", { for: "登入姓名" }, "姓名")), 選),
        h("div", { class: "欄" }, h("span", null, h("label", { for: "登入密碼" }, "密碼")), 密)),
      錯誤區,
      h("div", { class: "表工具列" },
        h("button", { class: "鈕 主", type: "button", id: "登入鈕", onclick: 送出 }, "登入"),
        h("button", { class: "鈕 文字", type: "button", onclick: 顯示開始畫面 }, "換一個資料夾")))));
  密.focus();
}

// 登入成功：記錄使用者、套用其主題偏好、進入首頁
function 登入完成(使用者) {
  狀態.使用者 = 使用者;
  if (使用者.主題) document.documentElement.setAttribute("data-theme", 使用者.主題);
  更新外框();
  前往("首頁");
}

// 登出：有未存變更時先詢問
async function 登出() {
  if (狀態.未存 && !(await 確認("有未存的變更，確定要登出嗎？（未存的變更會遺失）", "登出"))) return;
  狀態.未存 = false;
  顯示開始畫面();
}

// 改自己的密碼
function 改我的密碼() {
  const 欄位們 = [
    { key: "舊", 標題: "目前密碼", 類型: "密碼", 必填: true },
    { key: "新", 標題: "新密碼（至少 8 個字元）", 類型: "密碼", 必填: true },
    { key: "再次", 標題: "再輸入一次新密碼", 類型: "密碼", 必填: true }
  ];
  表單對話框("修改我的密碼", 欄位們, {}, async function (值) {
    if (!(await 驗證密碼(狀態.使用者, 值.舊))) return "目前密碼不正確";
    const 錯 = 檢查密碼(值.新, 值.再次);
    if (錯) return 錯;
    更新紀錄("使用者", 狀態.使用者.id, await 產生密碼紀錄(值.新), "修改密碼");
    提示("密碼已修改，記得存檔");
  });
}
