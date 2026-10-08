// 檔案說明：啟動（側欄選單、換頁、表頭按鈕、深淺色切換、Ctrl+S 存檔、關頁提醒、關於視窗、測試掛勾）

// 換到某一頁（參數會傳給該頁的繪製函式）
function 前往(名稱, 參數) {
  const 頁 = 頁面表[名稱];
  if (!頁 || !狀態.使用者) return;
  if (頁.可見 && !頁.可見()) { 提示("您的角色沒有這個功能的權限", true); return; }
  狀態.目前頁 = 名稱;
  狀態.頁參數 = 參數 || null;
  繪製側欄();
  const 內容 = 清空(document.getElementById("內容"));
  try {
    頁.繪製(內容, 參數 || {});
  } catch (e) {
    內容.appendChild(h("p", { class: "錯誤" }, "畫面發生錯誤：" + e.message));
    throw e;
  }
  document.getElementById("側欄").classList.remove("開");
  內容.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// 重新畫目前這一頁（例如存檔合併後資料變了）
function 重新繪製() {
  if (狀態.使用者 && 狀態.目前頁) 前往(狀態.目前頁, 狀態.頁參數);
}

// 畫左側功能選單（只列出目前角色看得到的功能）
function 繪製側欄() {
  const 側 = 清空(document.getElementById("側欄"));
  if (!狀態.使用者) return;
  頁面順序.forEach(function (名) {
    const 頁 = 頁面表[名];
    if (頁.可見 && !頁.可見()) return;
    if (頁.分隔) 側.appendChild(h("div", { class: "分隔" }));
    側.appendChild(h("button", { type: "button", "aria-current": 狀態.目前頁 === 名 ? "page" : null, onclick: function () { 前往(名); } },
      h("span", { class: "圖示", "aria-hidden": "true" }, 頁.圖示 || "•"), 名));
  });
  側.appendChild(h("div", { class: "分隔" }));
  側.appendChild(h("button", { type: "button", onclick: 改我的密碼 }, h("span", { class: "圖示", "aria-hidden": "true" }, "🔑"), "修改我的密碼"));
  側.appendChild(h("button", { type: "button", onclick: 關於 }, h("span", { class: "圖示", "aria-hidden": "true" }, "ℹ"), "關於本系統"));
  側.appendChild(h("button", { type: "button", id: "登出鈕", onclick: 登出 }, h("span", { class: "圖示", "aria-hidden": "true" }, "⏻"), "登出"));
}

// 更新表頭（協會名稱、使用者、存檔按鈕）與側欄
function 更新外框() {
  const 設 = 狀態.資料 && 狀態.資料.設定;
  document.getElementById("協會名").textContent = 設 ? 設.協會名稱 : "會務管理系統";
  document.title = (設 ? 設.協會名稱 + "｜" : "") + "會務管理系統 " + 版本;
  document.getElementById("使用者區").textContent = 狀態.使用者 ? 狀態.使用者.姓名 + "（" + 狀態.使用者.角色 + "）" : "";
  document.getElementById("存檔鈕").classList.toggle("隱藏", !(狀態.資料 && 狀態.使用者));
  document.getElementById("選單鈕").classList.toggle("隱藏", !狀態.使用者);
  更新存檔狀態();
  繪製側欄();
}

// 切換深色／淺色（記在使用者紀錄裡，下次登入沿用）
function 切換主題() {
  const 根 = document.documentElement;
  const 目前深 = 根.getAttribute("data-theme") ? 根.getAttribute("data-theme") === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const 新 = 目前深 ? "light" : "dark";
  根.setAttribute("data-theme", 新);
  if (狀態.使用者 && 狀態.資料) {
    const u = 找("使用者", 狀態.使用者.id);
    if (u) { u.主題 = 新; 標記未存(); }
  }
}

// 顯示目前頁面的使用說明
function 顯示說明() {
  const 頁 = 頁面表[狀態.目前頁];
  const 文字 = 頁 && 狀態.使用者 ? 頁.說明 : "請先選擇協會資料夾並登入。第一次使用時，選一個空資料夾，系統會引導您建立協會資料與第一位管理者。";
  對話框("說明：" + (狀態.使用者 && 頁 ? 狀態.目前頁 : "開始使用"), [
    h("p", null, 文字),
    h("h3", null, "共通操作"),
    h("ul", null,
      h("li", null, "改完資料要按右上角「存檔」（或 Ctrl+S）。每次存檔前會自動把舊檔備份到「備份」資料夾，保留最近 30 份。"),
      h("li", null, "多人同時使用時，存檔會自動合併別人的修改；同一筆資料兩邊都改時，會跳出對照讓您選。"),
      h("li", null, "列表可以點欄位標題排序、用搜尋框與下拉選單篩選、勾選後做批次動作、匯出 CSV／Excel。"),
      h("li", null, "角色只決定畫面上能做什麼，不是真正的資安控管；資料夾權限請由資訊單位設定。"))
  ]);
}

// 關於本系統：版本、說明、使用的開源元件（本系統沒有使用外部元件）
function 關於() {
  對話框("關於本系統", [
    h("p", null, h("img", { src: 會徽網址(), alt: "", width: 48, height: 48, style: "vertical-align:middle;margin-right:.5em" }), h("strong", null, "會務管理系統 " + 版本)),
    h("p", null, "建置日期：" + 建置日期),
    h("p", null, "單一離線 HTML：不連網、不使用瀏覽器儲存區；資料只存在您選的協會資料夾（協會資料.json、附件、備份）。"),
    h("p", null, "開源元件：無。試算表讀寫、壓縮檔解析都由本程式以瀏覽器內建功能完成，沒有引用外部函式庫。"),
    h("p", null, "會徽為自製圖形，可替換；未使用任何機關徽記。")
  ]);
}

// 綁定表頭按鈕、快捷鍵與關頁提醒，然後顯示開始畫面
function 啟動() {
  document.getElementById("存檔鈕").addEventListener("click", function () { 執行存檔(); });
  document.getElementById("主題鈕").addEventListener("click", 切換主題);
  document.getElementById("說明鈕").addEventListener("click", 顯示說明);
  document.getElementById("選單鈕").addEventListener("click", function () { document.getElementById("側欄").classList.toggle("開"); });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (狀態.資料 && 狀態.使用者) 執行存檔(); }
  });
  window.addEventListener("beforeunload", function (e) {
    if (狀態.未存) { e.preventDefault(); e.returnValue = ""; }
  });
  顯示開始畫面();
  if (測試模式) window.__T = { 狀態: 狀態, 前往: 前往, 存檔: 存檔, 合併資料: 合併資料, 國字金額: 國字金額, 讀試算表: 讀試算表, 產生xlsx: 產生xlsx };
}

// 按存檔：顯示錯誤訊息而不是讓程式中斷
async function 執行存檔() {
  try {
    await 存檔();
  } catch (e) {
    提示("存檔失敗：" + e.message, true);
  }
}

啟動();
