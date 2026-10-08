// 檔案說明：資料儲存（選協會資料夾、讀寫協會資料.json、自動備份、多人同時存檔的合併與衝突處理、附件、單檔模式）

const 資料檔名 = "協會資料.json";

// 瀏覽器支不支援「選資料夾」功能（Edge／Chrome 支援）
function 支援資料夾() {
  return typeof window.showDirectoryPicker === "function";
}

// 建立一份新的空白協會資料（第一次使用時）
function 空白資料(協會名稱) {
  const 時間 = 現在();
  const 資料 = {
    格式: "協會資料",
    格式版本: 1,
    設定: 預設設定(協會名稱, 時間)
  };
  集合清單.forEach(function (名) { 資料[名] = []; });
  return 資料;
}

// 預設設定：協會基本資料、服務機關、會員類別、會費標準、會計科目等
function 預設設定(協會名稱, 時間) {
  return {
    id: "設定",
    協會名稱: 協會名稱 || "財政部公務人員協會",
    標語: "凝聚同仁力量，促進權益與福利",
    宗旨: "", 沿革: "", 章程: "",
    地址: "", 電話: "", 傳真: "", Email: "", 服務時間: "週一至週五 09:00–17:00",
    組別: ["總務組", "財務組", "活動組", "福利組", "權益組"],
    // 依《財政部組織法》第 5 條所列次級機關整理；組織如有調整，請在「設定」增刪
    服務機關: ["財政部（部本部）", "財政部國庫署", "財政部賦稅署", "財政部關務署", "財政部國有財產署", "財政部財政資訊中心",
      "財政部臺北國稅局", "財政部高雄國稅局", "財政部北區國稅局", "財政部中區國稅局", "財政部南區國稅局", "財政部財政人員訓練所"],
    會員類別: ["一般會員", "榮譽會員"],
    會員標籤: ["新進", "理監事", "志工", "幹部"],
    活動類別: ["研習講座", "聯誼活動", "親子活動", "健康促進", "志工服務", "其他"],
    消息分類: ["協會公告", "活動訊息", "福利訊息", "權益訊息"],
    會費標準: { 入會費: 0, 常年會費: 0 },
    // 預設科目依《公務人員協會法》第 27 條經費來源整理，可自訂；正式報表請對照主管機關規定之科目
    會計科目: [
      { 代碼: "4101", 名稱: "入會費收入", 類別: "收入" },
      { 代碼: "4102", 名稱: "常年會費收入", 類別: "收入" },
      { 代碼: "4103", 名稱: "捐款收入", 類別: "收入" },
      { 代碼: "4104", 名稱: "委託收益", 類別: "收入" },
      { 代碼: "4105", 名稱: "基金及孳息收入", 類別: "收入" },
      { 代碼: "4106", 名稱: "政府補助收入", 類別: "收入" },
      { 代碼: "4107", 名稱: "活動收入", 類別: "收入" },
      { 代碼: "4199", 名稱: "其他收入", 類別: "收入" },
      { 代碼: "5101", 名稱: "會議費", 類別: "支出" },
      { 代碼: "5102", 名稱: "活動費", 類別: "支出" },
      { 代碼: "5103", 名稱: "會員福利及慰問費", 類別: "支出" },
      { 代碼: "5104", 名稱: "文具印刷費", 類別: "支出" },
      { 代碼: "5105", 名稱: "郵電費", 類別: "支出" },
      { 代碼: "5106", 名稱: "交通費", 類別: "支出" },
      { 代碼: "5107", 名稱: "業務推展費", 類別: "支出" },
      { 代碼: "5108", 名稱: "雜支", 類別: "支出" },
      { 代碼: "5109", 名稱: "提撥基金", 類別: "支出" }
    ],
    // 官網「權益專區」的相關法規連結（在「官網發布 → 協會簡介」填寫；本系統本身不連任何網址）
    法規連結: [],
    備份份數: 30,
    範例資料: false,
    建立時間: 時間, 修改時間: 時間, 修改人: "系統"
  };
}

// 補齊舊資料檔缺少的集合與設定欄位（升級相容）
function 補齊資料(資料) {
  if (!資料 || 資料.格式 !== "協會資料") throw new Error("這不是協會資料檔");
  集合清單.forEach(function (名) { if (!Array.isArray(資料[名])) 資料[名] = []; });
  const 預設 = 預設設定("", 現在());
  資料.設定 = Object.assign({}, 預設, 資料.設定 || {});
  return 資料;
}

// ===== 資料夾模式 =====

// 讓使用者選協會資料夾，讀入協會資料.json（沒有就回傳 null，表示要建立新的）
async function 選擇資料夾() {
  const 夾 = await window.showDirectoryPicker({ id: "協會資料夾", mode: "readwrite" });
  if (夾.requestPermission) {
    const 權 = await 夾.requestPermission({ mode: "readwrite" });
    if (權 !== "granted") throw new Error("沒有取得資料夾的讀寫權限");
  }
  狀態.資料夾 = 夾;
  狀態.模式 = "資料夾";
  return 讀資料夾內資料();
}

// 讀資料夾裡的協會資料.json；檔案不存在回傳 null
async function 讀資料夾內資料() {
  let 檔;
  try {
    檔 = await 狀態.資料夾.getFileHandle(資料檔名);
  } catch (e) {
    return null;
  }
  const f = await 檔.getFile();
  if (!f.size) return null;
  const 資料 = 補齊資料(JSON.parse(await f.text()));
  狀態.檔案時間 = f.lastModified;
  return 資料;
}

// 取得（必要時建立）子資料夾，例如 取子資料夾(["附件","活動"])
async function 取子資料夾(路徑們, 建立) {
  let 夾 = 狀態.資料夾;
  for (const 名 of 路徑們) 夾 = await 夾.getDirectoryHandle(名, { create: 建立 !== false });
  return 夾;
}

// 寫一個檔案到指定資料夾
async function 寫檔(夾, 檔名, 內容) {
  const 檔 = await 夾.getFileHandle(檔名, { create: true });
  const 寫 = await 檔.createWritable();
  await 寫.write(內容);
  await 寫.close();
  return 檔;
}

// 存檔前備份：把磁碟上目前的協會資料.json 複製到 備份/，只保留最近 N 份
async function 備份(目前文字) {
  const 夾 = await 取子資料夾(["備份"]);
  const d = new Date();
  const 時戳 = d.getFullYear() + 補零(d.getMonth() + 1) + 補零(d.getDate()) + "-" + 補零(d.getHours()) + 補零(d.getMinutes()) + 補零(d.getSeconds()) + "-" + 補零(d.getMilliseconds(), 3);
  await 寫檔(夾, "協會資料_" + 時戳 + ".json", 目前文字);
  const 名單 = [];
  for await (const [名, 項] of 夾.entries()) {
    if (項.kind === "file" && /^協會資料_\d{8}-\d{6}(-\d{3})?\.json$/.test(名)) 名單.push(名);
  }
  名單.sort().reverse();
  const 保留 = Math.max(1, Number(狀態.資料.設定.備份份數) || 30);
  for (const 名 of 名單.slice(保留)) await 夾.removeEntry(名);
}

// 存檔：若別人在這段期間存過，先讀入並合併；備份後寫入
async function 存檔() {
  if (!狀態.資料) return false;
  if (狀態.模式 === "單檔") return 下載資料檔();
  const 檔 = await 狀態.資料夾.getFileHandle(資料檔名, { create: true });
  const 磁碟檔 = await 檔.getFile();
  let 磁碟文字 = 磁碟檔.size ? await 磁碟檔.text() : "";
  if (磁碟檔.size && 磁碟檔.lastModified !== 狀態.檔案時間) {
    // 別人存過：以每筆紀錄的修改時間合併
    const 對方 = 補齊資料(JSON.parse(磁碟文字));
    const 結果 = 合併資料(狀態.基準, 狀態.資料, 對方);
    if (結果.衝突.length) {
      const 選擇 = await 衝突對話框(結果.衝突);
      if (!選擇) { 提示("已取消存檔，資料尚未寫入", true); return false; }
      套用衝突選擇(結果.資料, 結果.衝突, 選擇);
    }
    狀態.資料 = 結果.資料;
    if (狀態.使用者) 狀態.使用者 = 找("使用者", 狀態.使用者.id) || 狀態.使用者;
    提示("有其他人剛存過檔，已自動合併" + (結果.衝突.length ? "（含 " + 結果.衝突.length + " 筆衝突處理）" : ""));
  }
  if (磁碟文字) await 備份(磁碟文字);
  const 文字 = JSON.stringify(狀態.資料, null, 1);
  await 寫檔(狀態.資料夾, 資料檔名, 文字);
  const 新檔 = await (await 狀態.資料夾.getFileHandle(資料檔名)).getFile();
  狀態.檔案時間 = 新檔.lastModified;
  狀態.基準 = JSON.parse(文字);
  狀態.未存 = false;
  更新存檔狀態();
  if (typeof 重新繪製 === "function") 重新繪製();
  提示(磁碟文字 ? "已存檔（舊檔已自動備份）" : "已存檔");
  return true;
}

// ===== 合併 =====

// 三方合併：基準（上次讀入）、我的（目前編輯）、對方（磁碟上別人存的），以每筆紀錄的修改時間判斷
function 合併資料(基準, 我的, 對方) {
  基準 = 基準 || { 設定: {} };
  const 結果 = 深拷貝(對方);
  const 衝突 = [];
  // 判斷一筆紀錄跟基準比有沒有變（新增、刪除或修改時間不同）
  const 變了 = function (b, x) {
    if (!b && !x) return false;
    if (!b || !x) return true;
    return b.修改時間 !== x.修改時間;
  };
  集合清單.forEach(function (名) {
    const B = 依編號(基準[名]), M = 依編號(我的[名]), T = 依編號(對方[名]);
    const 全部 = new Set(Object.keys(B).concat(Object.keys(M), Object.keys(T)));
    const 輸出 = [];
    // 保持對方的順序，再接上我新增的
    const 順序 = (對方[名] || []).map(function (r) { return r.id; });
    (我的[名] || []).forEach(function (r) { if (順序.indexOf(r.id) < 0) 順序.push(r.id); });
    全部.forEach(function (id) { if (順序.indexOf(id) < 0) 順序.push(id); });
    順序.forEach(function (id) {
      const b = B[id], m = M[id], t = T[id];
      const 我改 = 變了(b, m), 他改 = 變了(b, t);
      let 採用;
      if (!我改) 採用 = t;
      else if (!他改) 採用 = m;
      else if (m && t && JSON.stringify(m) === JSON.stringify(t)) 採用 = t;
      else if (名 === "操作紀錄") 採用 = m || t;
      else {
        衝突.push({ 集合: 名, id: id, 我的: m || null, 對方: t || null });
        採用 = 較新(m, t);
      }
      if (採用) 輸出.push(深拷貝(採用));
    });
    if (名 === "操作紀錄") 輸出.sort(function (a, b) { return String(a.時間).localeCompare(String(b.時間)); });
    結果[名] = 輸出;
  });
  // 設定是單一物件，用同樣規則
  const b = 基準.設定, m = 我的.設定, t = 對方.設定;
  const 我改 = 變了(b, m), 他改 = 變了(b, t);
  if (我改 && !他改) 結果.設定 = 深拷貝(m);
  else if (我改 && 他改 && JSON.stringify(m) !== JSON.stringify(t)) {
    衝突.push({ 集合: "設定", id: "設定", 我的: m, 對方: t });
    結果.設定 = 深拷貝(較新(m, t));
  }
  return { 資料: 結果, 衝突: 衝突 };
}

// 把陣列轉成 {id: 紀錄}
function 依編號(清單) {
  const o = {};
  (清單 || []).forEach(function (r) { if (r && r.id) o[r.id] = r; });
  return o;
}

// 兩筆紀錄取修改時間較新的（被刪除的算最舊）
function 較新(a, b) {
  if (!a) return b;
  if (!b) return a;
  return String(a.修改時間) >= String(b.修改時間) ? a : b;
}

// 衝突對照對話框：每筆衝突列出兩邊不同的欄位，讓使用者選保留哪一邊；回傳 {索引: "我的"|"對方"} 或 null
async function 衝突對話框(衝突們) {
  const 區 = h("div", null,
    h("p", null, "您和其他人同時修改了下列資料。請逐筆選擇要保留哪一個版本（預設已選修改時間較新的）。"));
  衝突們.forEach(function (c, i) {
    const 欄位 = new Set(Object.keys(c.我的 || {}).concat(Object.keys(c.對方 || {})));
    const 列 = [];
    欄位.forEach(function (k) {
      if (k === "id" || k === "建立時間") return;
      const a = c.我的 ? 顯示值(c.我的[k]) : "（已刪除）", b = c.對方 ? 顯示值(c.對方[k]) : "（已刪除）";
      列.push(h("tr", { class: a !== b ? "不同" : "" }, h("th", null, k), h("td", null, a), h("td", null, b)));
    });
    const 預設對方 = 較新(c.我的, c.對方) === c.對方;
    區.appendChild(h("div", { class: "衝突", dataset: { index: i } },
      h("h3", null, c.集合 + "：" + (紀錄名稱(c.集合, c.我的 || c.對方 || {}))),
      h("div", { class: "表捲" }, h("table", { class: "表" },
        h("thead", null, h("tr", null, h("th", null, "欄位"), h("th", null, "我的版本"), h("th", null, "其他人的版本"))),
        h("tbody", null, 列))),
      h("div", { class: "標籤組" },
        h("label", null, h("input", { type: "radio", name: "衝突" + i, value: "我的", checked: !預設對方 }), "保留我的版本"),
        h("label", null, h("input", { type: "radio", name: "衝突" + i, value: "對方", checked: 預設對方 }), "採用其他人的版本"))));
  });
  return 對話框("資料衝突", 區, [
    { 文字: "取消存檔", 值: null },
    {
      文字: "依選擇合併並存檔", 主: true, 動作: function () {
        const 選 = {};
        衝突們.forEach(function (c, i) { 選[i] = 區.querySelector('input[name="衝突' + i + '"]:checked').value; });
        return 選;
      }
    }
  ], { 寬: true });
}

// 把欄位值轉成好讀的文字（陣列用頓號連接）
function 顯示值(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(function (x) { return typeof x === "object" ? JSON.stringify(x) : x; }).join("、");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}

// 依使用者的選擇修正合併結果
function 套用衝突選擇(資料, 衝突們, 選擇) {
  衝突們.forEach(function (c, i) {
    const 要的 = 選擇[i] === "我的" ? c.我的 : c.對方;
    if (c.集合 === "設定") { if (要的) 資料.設定 = 深拷貝(要的); return; }
    const 清單 = 資料[c.集合];
    const 位 = 清單.findIndex(function (r) { return r.id === c.id; });
    if (要的) { if (位 >= 0) 清單[位] = 深拷貝(要的); else 清單.push(深拷貝(要的)); }
    else if (位 >= 0) 清單.splice(位, 1);
  });
}

// ===== 附件 =====

// 把檔案存到 附件/子路徑/，檔名前加短編號避免重複；回傳相對路徑（附件/…/檔名）
async function 存附件(子路徑們, 檔案) {
  if (狀態.模式 !== "資料夾") throw new Error("單檔模式無法存附件，請改用支援資料夾功能的 Edge 瀏覽器");
  const 夾 = await 取子資料夾(["附件"].concat(子路徑們));
  const 安全名 = 檔案.name.replace(/[\\/:*?"<>|]/g, "_");
  const 名 = 新編號().slice(-6) + "_" + 安全名;
  await 寫檔(夾, 名, 檔案);
  return ["附件"].concat(子路徑們, [名]).join("/");
}

// 依相對路徑讀附件，回傳 File；找不到回傳 null
async function 讀附件(路徑) {
  if (狀態.模式 !== "資料夾" || !路徑) return null;
  try {
    const 段 = 路徑.split("/");
    const 夾 = await 取子資料夾(段.slice(0, -1), false);
    return await (await 夾.getFileHandle(段[段.length - 1])).getFile();
  } catch (e) {
    return null;
  }
}

// 刪除附件檔（找不到就略過）
async function 刪附件(路徑) {
  if (狀態.模式 !== "資料夾" || !路徑) return;
  try {
    const 段 = 路徑.split("/");
    const 夾 = await 取子資料夾(段.slice(0, -1), false);
    await 夾.removeEntry(段[段.length - 1]);
  } catch (e) { /* 檔案已不存在 */ }
}

// ===== 單檔模式（瀏覽器不支援資料夾功能時）=====

// 讓使用者選一個協會資料.json 檔讀入
function 開啟資料檔() {
  return new Promise(function (完成, 失敗) {
    const 選 = h("input", { type: "file", accept: ".json,application/json" });
    選.addEventListener("change", async function () {
      try {
        const f = 選.files[0];
        if (!f) return 完成(undefined);
        狀態.模式 = "單檔";
        狀態.檔名 = f.name;
        完成(補齊資料(JSON.parse(await f.text())));
      } catch (e) { 失敗(e); }
    });
    選.click();
  });
}

// 單檔模式存檔：下載整份資料檔，請使用者放回原位置
function 下載資料檔() {
  const 文字 = JSON.stringify(狀態.資料, null, 1);
  下載檔案(資料檔名, 文字, "application/json");
  狀態.基準 = JSON.parse(文字);
  狀態.未存 = false;
  更新存檔狀態();
  提示("已下載資料檔，請放回協會資料夾覆蓋舊檔");
  return true;
}
