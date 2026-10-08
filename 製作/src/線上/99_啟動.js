// 檔案說明：啟動（側欄選單、換頁、深淺色、說明、檢查連線設定、處理信件連結）

// 換到某一頁（頁面繪製可以是非同步的；讀資料失敗時顯示錯誤訊息）
async function 前往(名稱, 參數) {
  const 頁 = 頁面表[名稱];
  if (!頁 || !連線.帳號) return;
  if (頁.可見 && !頁.可見()) { 提示("沒有這個功能的權限", true); return; }
  狀態.目前頁 = 名稱;
  狀態.頁參數 = 參數 || null;
  繪製側欄();
  document.getElementById("側欄").classList.remove("開");
  const 內容 = 清空(document.getElementById("內容"));
  內容.appendChild(h("p", { class: "次要字" }, "讀取中…"));
  const 暫存 = h("div");
  try {
    await 頁.繪製(暫存, 參數 || {});
    if (狀態.目前頁 !== 名稱) return;
    清空(內容).appendChild(暫存);
  } catch (e) {
    清空(內容).appendChild(h("p", { class: "錯誤" }, "讀取失敗：" + e.message));
    if (/逾時|JWT/.test(e.message)) { 清除登入(); 顯示登入頁(e.message); }
  }
  window.scrollTo(0, 0);
}

// 重新畫目前這一頁
function 重新繪製() {
  if (連線.帳號 && 狀態.目前頁) 前往(狀態.目前頁, 狀態.頁參數);
}

// 畫左側功能選單（只列出看得到的功能）
function 繪製側欄() {
  const 側 = 清空(document.getElementById("側欄"));
  if (!連線.帳號) return;
  頁面順序.forEach(function (名) {
    const 頁 = 頁面表[名];
    if (頁.可見 && !頁.可見()) return;
    if (頁.分隔) 側.appendChild(h("div", { class: "分隔" }));
    側.appendChild(h("button", { type: "button", "aria-current": 狀態.目前頁 === 名 ? "page" : null, onclick: function () { 前往(名); } },
      h("span", { class: "圖示", "aria-hidden": "true" }, 頁.圖示 || "•"), 名));
  });
  側.appendChild(h("div", { class: "分隔" }));
  側.appendChild(h("button", { type: "button", id: "登出鈕", onclick: 登出 }, h("span", { class: "圖示", "aria-hidden": "true" }, "⏻"), "登出"));
}

// 更新表頭（登入者）與側欄
function 更新外框() {
  const 區 = document.getElementById("使用者區");
  區.textContent = 連線.帳號 ? (線上.會員 ? 線上.會員.name : 連線.帳號.email) + (線上.幹部 ? "（" + 線上.幹部 + "）" : "") : "";
  document.getElementById("選單鈕").classList.toggle("隱藏", !連線.帳號);
  繪製側欄();
  if (!連線.帳號) 清空(document.getElementById("側欄"));
}

// 切換深色／淺色
function 切換主題() {
  const 根 = document.documentElement;
  const 深 = 根.getAttribute("data-theme") ? 根.getAttribute("data-theme") === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  根.setAttribute("data-theme", 深 ? "light" : "dark");
}

// 顯示目前頁面的說明
function 顯示說明() {
  const 頁 = 頁面表[狀態.目前頁];
  對話框("說明" + (連線.帳號 && 頁 ? "：" + 狀態.目前頁 : ""), [
    h("p", null, 連線.帳號 && 頁 ? 頁.說明 : "會員請用協會名冊上的 Email 註冊帳號，驗證 Email 後登入，系統會自動連結您的會員資料。還不是會員的同仁，註冊登入後可以線上申請入會。"),
    h("p", { class: "小字 次要字" }, "為保護個資，登入資訊只保留在這個分頁，關閉或重新整理就需要重新登入。每個人只看得到自己的資料，幹部才看得到全體名冊。")
  ]);
}

// 啟動：檢查連線設定、綁定按鈕、處理信件連結，否則顯示登入畫面
async function 啟動() {
  document.getElementById("主題鈕").addEventListener("click", 切換主題);
  document.getElementById("說明鈕").addEventListener("click", 顯示說明);
  document.getElementById("選單鈕").addEventListener("click", function () { document.getElementById("側欄").classList.toggle("開"); });
  if (!讀連線設定()) {
    置中卡片("會員專區尚未啟用", [h("p", null, "協會尚未完成線上系統設定（連線設定.js）。請洽協會。")]);
    return;
  }
  if (測試模式) window.__T = { 連線: 連線, 線上: 線上 };
  if (await 處理信件連結()) return;
  顯示登入頁();
}

啟動();
