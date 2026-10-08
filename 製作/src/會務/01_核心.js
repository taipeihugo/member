// 檔案說明：核心（系統狀態、資料集合、角色權限、新增修改刪除紀錄、操作紀錄、提示、對話框、列印）

// ===== 系統狀態 =====
const 狀態 = {
  資料: null,        // 目前編輯中的協會資料（整份）
  基準: null,        // 上次讀入或存檔時磁碟上的內容（合併時用來判斷誰改了什麼）
  資料夾: null,      // 使用者選的協會資料夾（資料夾模式）
  檔案時間: 0,       // 上次讀入或存檔時，協會資料.json 的修改時間
  模式: "",          // "資料夾" 或 "單檔"（瀏覽器不支援資料夾功能時）
  檔名: "協會資料.json",
  使用者: null,      // 目前登入的使用者紀錄
  未存: false,       // 有沒有尚未存檔的變更
  目前頁: "",
  頁參數: null
};

// 資料檔裡的各個資料集合（每個都是陣列，每筆有 id、建立時間、修改時間、修改人）
const 集合清單 = ["使用者", "會員", "會員異動", "會費", "催繳", "傳票", "預算", "活動", "報名",
  "消息", "福利", "特約商店", "權益成果", "下載", "常見問答", "理監事", "操作紀錄"];

// 角色（只決定介面能做什麼，不是真正的資安控管）
const 角色清單 = ["理事長", "常務理事", "理事", "監事", "秘書長", "會計", "承辦人", "一般會員"];

// 各項動作允許哪些角色
const 權限表 = {
  "個資.檢視": ["理事長", "常務理事", "理事", "監事", "秘書長", "會計", "承辦人"],
  "會員.編輯": ["理事長", "秘書長", "承辦人"],
  "會費.收繳": ["理事長", "秘書長", "會計", "承辦人"],
  "帳務.檢視": ["理事長", "常務理事", "理事", "監事", "秘書長", "會計", "承辦人"],
  "帳務.編輯": ["理事長", "秘書長", "會計"],
  "活動.編輯": ["理事長", "秘書長", "承辦人"],
  "官網.編輯": ["理事長", "秘書長", "承辦人"],
  "設定.編輯": ["理事長", "秘書長"],
  "紀錄.檢視": ["理事長", "常務理事", "監事", "秘書長"]
};

// 判斷目前登入的人能不能做某個動作
function 可(權限) {
  const 角色 = 狀態.使用者 && 狀態.使用者.角色;
  return !!(角色 && 權限表[權限] && 權限表[權限].indexOf(角色) >= 0);
}

// ===== 資料存取 =====

// 取得某個集合（陣列）；不存在就建立空陣列
function 集合(名稱) {
  if (!狀態.資料[名稱]) 狀態.資料[名稱] = [];
  return 狀態.資料[名稱];
}

// 依 id 找一筆紀錄
function 找(名稱, id) {
  return 集合(名稱).find(function (r) { return r.id === id; }) || null;
}

// 目前操作者的名字（寫入修改人、操作紀錄）
function 操作者() {
  return 狀態.使用者 ? 狀態.使用者.姓名 : "系統";
}

// 新增一筆紀錄到集合，自動補上 id、建立時間、修改時間、修改人，並寫操作紀錄
function 新增紀錄(名稱, 物件, 摘要) {
  const 時間 = 現在();
  const r = Object.assign({ id: 新編號() }, 物件, { 建立時間: 時間, 修改時間: 時間, 修改人: 操作者() });
  集合(名稱).push(r);
  if (名稱 !== "操作紀錄") 記錄操作("新增", 名稱, 摘要 || 紀錄名稱(名稱, r));
  標記未存();
  return r;
}

// 修改一筆紀錄的部分欄位，自動更新修改時間與修改人，並把改了哪些欄位寫進操作紀錄
function 更新紀錄(名稱, id, 變更, 摘要) {
  const r = 找(名稱, id);
  if (!r) throw new Error("找不到要修改的資料");
  const 改了 = Object.keys(變更).filter(function (k) { return JSON.stringify(r[k]) !== JSON.stringify(變更[k]); });
  if (!改了.length) return r;
  Object.assign(r, 變更, { 修改時間: 現在(), 修改人: 操作者() });
  記錄操作("修改", 名稱, (摘要 || 紀錄名稱(名稱, r)) + "（" + 改了.join("、") + "）");
  標記未存();
  return r;
}

// 刪除一筆紀錄並寫操作紀錄
function 刪除紀錄(名稱, id, 摘要) {
  const 清單 = 集合(名稱);
  const i = 清單.findIndex(function (r) { return r.id === id; });
  if (i < 0) return;
  const r = 清單[i];
  清單.splice(i, 1);
  記錄操作("刪除", 名稱, 摘要 || 紀錄名稱(名稱, r));
  標記未存();
}

// 修改設定（設定是單一物件）
function 更新設定(變更) {
  Object.assign(狀態.資料.設定, 變更, { 修改時間: 現在(), 修改人: 操作者() });
  記錄操作("修改", "設定", Object.keys(變更).join("、"));
  標記未存();
}

// 給操作紀錄用的簡短名稱（例：會員「王小明」）
function 紀錄名稱(名稱, r) {
  const 名 = r.姓名 || r.名稱 || r.標題 || r.問題 || r.傳票號 || r.收據號 || "";
  return 名 ? 名稱 + "「" + 名 + "」" : 名稱;
}

// 寫一筆操作紀錄（誰在何時做了什麼），最多保留 5000 筆
function 記錄操作(動作, 對象, 說明) {
  const 時間 = 現在();
  const 清單 = 集合("操作紀錄");
  清單.push({ id: 新編號(), 時間: 時間, 人: 操作者(), 動作: 動作, 對象: 對象, 說明: 說明 || "", 建立時間: 時間, 修改時間: 時間, 修改人: 操作者() });
  if (清單.length > 5000) 清單.splice(0, 清單.length - 5000);
}

// 標記「有未存的變更」，並更新表頭狀態
function 標記未存() {
  狀態.未存 = true;
  更新存檔狀態();
}

// 更新表頭的存檔狀態文字
function 更新存檔狀態() {
  const el = document.getElementById("存檔狀態");
  if (!el) return;
  if (!狀態.資料) { el.textContent = ""; el.className = "標記"; return; }
  el.textContent = 狀態.未存 ? "有未存變更" : "已存檔";
  el.className = "標記 " + (狀態.未存 ? "警" : "成");
}

// ===== 提示與對話框 =====

// 在右下角顯示提示訊息，幾秒後自動消失
function 提示(訊息, 是錯誤) {
  const 區 = document.getElementById("提示區");
  const el = h("div", { class: "提示" + (是錯誤 ? " 錯" : "") }, 訊息);
  區.appendChild(el);
  setTimeout(function () { el.remove(); }, 是錯誤 ? 7000 : 3500);
}

// 開一個對話框；內容可以是元素或元素陣列，按鈕用 [{文字, 主, 動作}]；回傳 Promise（關閉時帶回結果）
function 對話框(標題, 內容, 按鈕, 選項) {
  選項 = 選項 || {};
  return new Promise(function (完成) {
    let 結果 = null;
    const 框 = h("dialog", { class: "對話框" + (選項.寬 ? " 寬" : ""), "aria-label": 標題 });
    const 關閉 = function (值) { 結果 = 值; 框.close(); };
    const 尾 = h("div", { class: "框尾" });
    (按鈕 || [{ 文字: "關閉" }]).forEach(function (b) {
      尾.appendChild(h("button", {
        type: "button", class: "鈕" + (b.主 ? " 主" : "") + (b.危 ? " 危" : ""),
        onclick: async function () {
          if (!b.動作) return 關閉(b.值 == null ? null : b.值);
          const v = await b.動作(關閉);
          if (v !== false && v !== undefined) 關閉(v);
        }
      }, b.文字));
    });
    框.appendChild(h("div", { class: "框頭" }, h("h2", null, 標題),
      h("button", { type: "button", class: "鈕 小 關", "aria-label": "關閉", onclick: function () { 關閉(null); } }, "✕")));
    框.appendChild(h("div", { class: "框身" }, 內容));
    框.appendChild(尾);
    框.addEventListener("close", function () { 框.remove(); 完成(結果); });
    document.body.appendChild(框);
    框.showModal();
    if (選項.開啟後) 選項.開啟後(框);
  });
}

// 確認對話框：回傳 true（確定）或 false（訊息裡的換行照樣顯示）
async function 確認(訊息, 確定文字) {
  const v = await 對話框("請確認", h("p", { class: "保留換行" }, 訊息), [
    { 文字: "取消", 值: false }, { 文字: 確定文字 || "確定", 主: true, 值: true }]);
  return v === true;
}

// 建立表單欄位元素；欄位定義 {key, 標題, 類型, 選項, 必填, 說明, 寬}
function 表單欄位(f, 值) {
  const id = "欄_" + 新編號();
  let 輸入;
  const v = 值 == null ? "" : 值;
  switch (f.類型) {
    case "多行":
      輸入 = h("textarea", { id: id, rows: f.行數 || 5 });
      輸入.value = v;
      break;
    case "選單":
      // 必填且還沒有值時放一個「請選擇」佔位（不能選回來），避免瀏覽器自動選第一項、讓必填檢查失效；
      // 選項本身已含空值（例如「無」）的欄位設 不加空白
      輸入 = h("select", { id: id },
        f.不加空白 ? null : f.必填 ? (v === "" || v == null ? h("option", { value: "", disabled: true, selected: true, hidden: true }, "請選擇") : null) : h("option", { value: "" }, "（未選）"),
        (typeof f.選項 === "function" ? f.選項() : f.選項 || []).map(function (o) {
          const 值o = typeof o === "object" ? o.值 : o;
          const 字 = typeof o === "object" ? o.字 : o;
          return h("option", { value: 值o, selected: String(值o) === String(v) }, 字);
        }));
      if (v !== "" && 輸入.value !== String(v)) 輸入.appendChild(h("option", { value: v, selected: true }, v));
      break;
    case "多選": {
      const 已選 = Array.isArray(v) ? v : [];
      輸入 = h("div", { class: "標籤組", id: id, role: "group" },
        (typeof f.選項 === "function" ? f.選項() : f.選項 || []).map(function (o) {
          return h("label", null, h("input", { type: "checkbox", value: o, checked: 已選.indexOf(o) >= 0 }), o);
        }));
      break;
    }
    case "勾選":
      輸入 = h("input", { id: id, type: "checkbox", checked: !!v });
      break;
    case "數字": case "金額":
      輸入 = h("input", { id: id, type: "number", step: "1", min: f.最小 == null ? null : f.最小, value: v });
      break;
    case "日期":
      輸入 = h("input", { id: id, type: "date", value: v });
      break;
    case "時間":
      輸入 = h("input", { id: id, type: "time", value: v });
      break;
    case "密碼":
      輸入 = h("input", { id: id, type: "password", autocomplete: "new-password", value: v });
      break;
    case "Email":
      輸入 = h("input", { id: id, type: "email", value: v });
      break;
    case "檔案":
      輸入 = h("input", { id: id, type: "file", accept: f.接受 || null });
      break;
    default:
      輸入 = h("input", { id: id, type: "text", value: v });
  }
  輸入.dataset.key = f.key;
  if (f.唯讀) 輸入.disabled = true;
  const 寬 = f.寬 || f.類型 === "多行" || f.類型 === "多選";
  return h("div", { class: "欄" + (寬 ? " 寬" : "") },
    h("span", { class: f.必填 ? "必填" : "" }, h("label", { for: id }, f.標題)),
    f.類型 === "勾選" ? h("label", null, 輸入, " " + (f.勾選文字 || "是")) : 輸入,
    f.說明 ? h("small", null, f.說明) : null);
}

// 讀出表單裡各欄位的值（依欄位類型轉成文字、數字、陣列或布林）
function 讀表單(表單, 欄位們) {
  const 值 = {};
  欄位們.forEach(function (f) {
    const el = 表單.querySelector('[data-key="' + f.key + '"]');
    if (!el) return;
    if (f.類型 === "多選") 值[f.key] = Array.from(el.querySelectorAll("input:checked")).map(function (c) { return c.value; });
    else if (f.類型 === "勾選") 值[f.key] = el.checked;
    else if (f.類型 === "檔案") 值[f.key] = el.files && el.files[0] ? el.files[0] : null;
    else if (f.類型 === "數字" || f.類型 === "金額") 值[f.key] = el.value === "" ? "" : Number(el.value);
    else 值[f.key] = el.value.trim();
  });
  return 值;
}

// 表單對話框：顯示欄位讓人填寫，按儲存時驗證必填並呼叫 儲存(值)；儲存回傳文字表示錯誤訊息
function 表單對話框(標題, 欄位們, 初值, 儲存, 選項) {
  初值 = 初值 || {};
  const 表單 = h("form", { class: "表單", onsubmit: function (e) { e.preventDefault(); } },
    欄位們.map(function (f) { return 表單欄位(f, 初值[f.key] == null ? f.預設 : 初值[f.key]); }));
  const 錯誤區 = h("p", { class: "錯誤", role: "alert" });
  return 對話框(標題, [表單, 錯誤區], ((選項 && 選項.額外按鈕) || []).concat([
    { 文字: "取消", 值: null },
    {
      文字: (選項 && 選項.儲存文字) || "儲存", 主: true, 動作: async function () {
        const 值 = 讀表單(表單, 欄位們);
        const 缺 = 欄位們.filter(function (f) {
          return f.必填 && (值[f.key] === "" || 值[f.key] == null || (Array.isArray(值[f.key]) && !值[f.key].length));
        });
        if (缺.length) { 錯誤區.textContent = "請填寫：" + 缺.map(function (f) { return f.標題; }).join("、"); return false; }
        const 結果 = await 儲存(值);
        if (typeof 結果 === "string") { 錯誤區.textContent = 結果; return false; }
        return 值;
      }
    }
  ]), 選項);
}

// ===== 選檔 =====

// 跳出選檔視窗，回傳使用者選的檔案陣列；暫時把選檔元素放進頁面，選完就移除（使用者按取消時不會回傳）
function 選擇檔案(接受, 多選) {
  // 清掉上次按取消而留下的選檔元素
  document.querySelectorAll("input.暫用選檔").forEach(function (el) { el.remove(); });
  return new Promise(function (完成) {
    const 選 = h("input", { type: "file", accept: 接受 || null, multiple: !!多選, class: "隱藏 暫用選檔" });
    選.addEventListener("change", function () {
      const 檔們 = Array.from(選.files || []);
      選.remove();
      if (檔們.length) 完成(檔們);
    });
    document.body.appendChild(選);
    選.click();
  });
}

// ===== 列印 =====

// 把內容放到列印區後呼叫瀏覽器列印（A4 直式；可選標楷體）
function 列印(內容, 標楷) {
  const 區 = document.getElementById("列印區");
  清空(區);
  區.className = "列印區" + (標楷 ? " 標楷" : "");
  加入子元素(區, [內容]);
  if (測試模式) { 狀態.最後列印 = 區.textContent; return; }
  setTimeout(function () { window.print(); }, 50);
}

// 列印前詢問是否使用標楷體，然後列印
async function 列印詢問(內容) {
  const v = await 對話框("列印", h("p", null, "要用哪一種字型列印？（A4 直式）"), [
    { 文字: "取消", 值: null }, { 文字: "一般字型", 值: "一般" }, { 文字: "標楷體", 主: true, 值: "標楷" }]);
  if (v) 列印(內容, v === "標楷");
}

// ===== 頁面註冊與頁籤 =====
const 頁面表 = {};
const 頁面順序 = [];

// 註冊一個功能頁：{標題, 圖示, 可見(), 繪製(容器, 參數), 說明}
function 註冊頁面(名稱, 定義) {
  頁面表[名稱] = 定義;
  頁面順序.push(名稱);
}

// 建立頁首（標題＋右側工具按鈕）
function 頁首(標題, 工具們) {
  return h("div", { class: "頁首" }, h("h1", null, 標題), h("div", { class: "工具" }, 工具們 || []));
}

// 建立頁籤列；切換時呼叫 繪製(名稱, 容器)；回傳 {元素, 切換(名稱)}
function 建立頁籤(名稱們, 預設, 繪製) {
  const 列 = h("div", { class: "頁籤", role: "tablist" });
  const 區 = h("div", { role: "tabpanel" });
  const 切換 = function (名) {
    Array.from(列.children).forEach(function (b) { b.setAttribute("aria-selected", b.dataset.name === 名 ? "true" : "false"); });
    清空(區);
    繪製(名, 區);
  };
  名稱們.forEach(function (名) {
    列.appendChild(h("button", { type: "button", role: "tab", dataset: { name: 名 }, onclick: function () { 切換(名); } }, 名));
  });
  切換(預設 || 名稱們[0]);
  return { 元素: h("div", null, 列, 區), 切換: 切換 };
}

// 本年度（西元）
function 本年() {
  return new Date().getFullYear();
}
