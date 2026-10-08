// 檔案說明：會員名冊（基本資料、標籤、多條件查詢、入會／退會／轉調異動歷程、分眾名單、匯入匯出、入會申請審核）

const 會籍狀態們 = ["申請中", "有效", "停權", "退會"];
const 異動類型們 = ["入會", "退會", "轉調", "復會", "停權"];

註冊頁面("會員名冊", {
  圖示: "👥",
  可見: function () { return 可("個資.檢視"); },
  說明: "管理會員基本資料。點一列可看詳細資料與異動歷程（入會、退會、轉調），並在那裡辦理異動。上方可依機關、類別、會籍狀態、標籤、入會年度篩選；勾選多人後可複製 Outlook 收件者、匯出合併列印用 CSV、加減標籤、列印名冊。「匯入」支援 Excel（.xlsx）、ODS、CSV，會先讓您對應欄位並比對重複。官網的入會申請檔請用「匯入入會申請」，審核後再核准入會。個資只收必要欄位，不收身分證字號。",
  繪製: 繪製會員名冊
});

// 會員資料的欄位定義（表單用）
function 會員欄位() {
  const 設 = 狀態.資料.設定;
  return [
    { key: "姓名", 標題: "姓名", 必填: true },
    { key: "員工編號", 標題: "員工編號", 說明: "活動簽到可用" },
    { key: "服務機關", 標題: "服務機關", 類型: "選單", 選項: function () { return 設.服務機關; }, 必填: true },
    { key: "單位", 標題: "單位" },
    { key: "職稱", 標題: "職稱" },
    { key: "公務電話", 標題: "公務電話" },
    { key: "Email", 標題: "Email", 類型: "Email" },
    { key: "入會日期", 標題: "入會日期", 類型: "日期" },
    { key: "會員類別", 標題: "會員類別", 類型: "選單", 選項: function () { return 設.會員類別; }, 必填: true, 預設: 設.會員類別[0] },
    { key: "會籍狀態", 標題: "會籍狀態", 類型: "選單", 選項: 會籍狀態們, 必填: true, 預設: "有效" },
    { key: "標籤", 標題: "標籤", 類型: "多選", 選項: function () { return 設.會員標籤; } },
    { key: "備註", 標題: "備註", 類型: "多行", 行數: 2 }
  ];
}

// 產生下一個會員編號（M0001、M0002…）
function 下一個會員編號() {
  const 最大 = 集合("會員").reduce(function (m, r) { const n = Number(String(r.會員編號 || "").replace(/\D/g, "")); return n > m ? n : m; }, 0);
  return "M" + 補零(最大 + 1, 4);
}

// 新增一位會員並寫入「入會」異動（申請中的不寫）
function 新增會員(值, 說明) {
  const m = 新增紀錄("會員", Object.assign({ 會員編號: 下一個會員編號(), 標籤: [] }, 值));
  if (m.會籍狀態 !== "申請中") {
    新增紀錄("會員異動", { 會員id: m.id, 日期: m.入會日期 || 今天(), 類型: "入會", 說明: 說明 || "", 新機關: m.服務機關 || "" }, "會員異動「" + m.姓名 + " 入會」");
  }
  return m;
}

// 找可能重複的會員：員工編號相同、Email 相同、或姓名＋服務機關相同
function 找重複會員(值, 排除id) {
  const 小 = function (s) { return String(s || "").trim().toLowerCase(); };
  return 集合("會員").find(function (m) {
    if (m.id === 排除id) return false;
    if (值.員工編號 && 小(m.員工編號) === 小(值.員工編號)) return true;
    if (值.Email && 小(m.Email) === 小(值.Email)) return true;
    return 值.姓名 && m.姓名 === 值.姓名 && (m.服務機關 || "") === (值.服務機關 || "");
  }) || null;
}

// 畫出會員名冊頁
function 繪製會員名冊(容器, 參數) {
  const 可編 = 可("會員.編輯");
  const 設 = 狀態.資料.設定;
  const 表 = 資料表({
    匯出檔名: "會員名冊",
    資料: function () { return 集合("會員"); },
    預設排序: { key: "會員編號" },
    欄位: [
      { key: "會員編號", 標題: "編號" },
      { key: "姓名", 標題: "姓名" },
      { key: "服務機關", 標題: "服務機關" },
      { key: "單位", 標題: "單位" },
      { key: "職稱", 標題: "職稱" },
      { key: "公務電話", 標題: "公務電話" },
      { key: "Email", 標題: "Email" },
      { key: "入會日期", 標題: "入會日期", 顯示: function (r) { return 民國(r.入會日期); } },
      { key: "會員類別", 標題: "類別" },
      { key: "會籍狀態", 標題: "會籍", 顯示: function (r) { return h("span", { class: "標記 " + ({ 有效: "成", 申請中: "金", 停權: "警", 退會: "危" }[r.會籍狀態] || "") }, r.會籍狀態); } },
      { key: "標籤", 標題: "標籤", 值: function (r) { return (r.標籤 || []).join("、"); } },
      { key: "員工編號", 標題: "員工編號" }
    ],
    篩選: [
      { 標題: "機關", 選項: function () { return 設.服務機關; }, 取值: function (r) { return r.服務機關; } },
      { 標題: "類別", 選項: function () { return 設.會員類別; }, 取值: function (r) { return r.會員類別; } },
      { 標題: "會籍", 選項: 會籍狀態們, 取值: function (r) { return r.會籍狀態; } },
      { 標題: "標籤", 選項: function () { return 設.會員標籤; }, 取值: function (r) { return r.標籤 || []; } },
      { 標題: "入會年度", 選項: function () { return 入會年度們(); }, 取值: function (r) { return r.入會日期 ? 民國年(r.入會日期.slice(0, 4)) + " 年" : ""; } }
    ],
    點列: function (r) { 會員詳細(r.id, function () { 表.重繪(); }); },
    批次: [
      { 文字: "複製 Outlook 收件者", 動作: function (列) { 顯示收件者(列); } },
      { 文字: "匯出合併列印 CSV", 動作: function (列) { 匯出合併列印(列); } },
      可編 ? { 文字: "加標籤", 動作: function (列) { 批次標籤(列, true, 表); } } : null,
      可編 ? { 文字: "移除標籤", 動作: function (列) { 批次標籤(列, false, 表); } } : null,
      { 文字: "列印名冊", 動作: function (列) { 列印名冊(列); } }
    ].filter(Boolean)
  });
  容器.appendChild(頁首("會員名冊", [
    可編 ? h("button", { class: "鈕 主", type: "button", id: "新增會員鈕", onclick: function () { 編輯會員(null, 表.重繪); } }, "＋ 新增會員") : null,
    可編 ? h("button", { class: "鈕", type: "button", id: "匯入會員鈕", onclick: function () { 匯入會員(表.重繪); } }, "匯入名冊") : null,
    可編 ? h("button", { class: "鈕", type: "button", id: "匯入申請鈕", onclick: function () { 匯入入會申請(表.重繪); } }, "匯入入會申請") : null,
    h("button", { class: "鈕", type: "button", onclick: function () { 列印名冊(表.目前()); } }, "列印名冊")
  ]));
  容器.appendChild(h("p", { class: "次要字 小字" }, "個資只收必要欄位（不收身分證字號）。匯出或列印的名冊請妥善保管，用畢銷毀。"));
  容器.appendChild(表.元素);
  // 從首頁點「入會申請待審」進來時，自動篩選申請中
  if (參數 && 參數.狀態) {
    const 選 = 表.元素.querySelectorAll(".表工具列 select")[2];
    if (選) { 選.value = 參數.狀態; 選.dispatchEvent(new Event("change")); }
  }
}

// 列出名冊中出現過的入會年度（民國）
function 入會年度們() {
  const s = new Set();
  集合("會員").forEach(function (m) { if (m.入會日期) s.add(民國年(m.入會日期.slice(0, 4)) + " 年"); });
  return Array.from(s).sort().reverse();
}

// 新增或編輯會員資料
function 編輯會員(id, 完成後) {
  const 原 = id ? 找("會員", id) : null;
  const 欄位們 = 會員欄位();
  return 表單對話框(原 ? "編輯會員：" + 原.姓名 : "新增會員", 欄位們, 原 || { 入會日期: 今天() }, function (值) {
    if (值.Email && !/^[^@\s]+@[^@\s]+$/.test(值.Email)) return "Email 格式不正確";
    const 重複 = 找重複會員(值, id);
    if (重複) return "可能與既有會員重複：" + 重複.會員編號 + " " + 重複.姓名 + "（" + (重複.服務機關 || "") + "）";
    if (原) {
      if (值.會籍狀態 === "退會" && 原.會籍狀態 !== "退會") 值.退會日期 = 今天();
      更新紀錄("會員", id, 值);
    } else 新增會員(值);
    提示("已儲存會員資料");
    if (完成後) 完成後();
  });
}

// 會員詳細資料：基本資料、異動歷程、會費紀錄、活動參與，以及辦理異動的按鈕
function 會員詳細(id, 完成後) {
  const m = 找("會員", id);
  if (!m) return;
  const 可編 = 可("會員.編輯");
  const 重整 = function () { if (完成後) 完成後(); };
  const 基本 = h("div", { class: "表單" }, 會員欄位().map(function (f) {
    return h("div", { class: "欄" + (f.類型 === "多行" ? " 寬" : "") }, h("span", null, f.標題), h("div", null, f.類型 === "日期" ? 民國(m[f.key]) : 顯示值(m[f.key]) || "—"));
  }));
  const 異動 = 集合("會員異動").filter(function (x) { return x.會員id === id; }).sort(function (a, b) { return 比較(a.日期, b.日期); });
  const 會費 = 集合("會費").filter(function (x) { return x.會員id === id; }).sort(function (a, b) { return 比較(b.繳費日, a.繳費日); });
  const 報名 = 集合("報名").filter(function (x) { return x.會員id === id; });
  const 小表 = function (標題們, 列們) {
    return 列們.length ? h("div", { class: "表捲" }, h("table", { class: "表" }, h("thead", null, h("tr", null, 標題們.map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 列們.map(function (r) { return h("tr", null, r.map(function (v) { return h("td", null, v); })); })))) : h("p", { class: "次要字" }, "無");
  };
  const 按鈕們 = [];
  if (可編) {
    按鈕們.push({ 文字: "編輯資料", 動作: function (關) { 關(null); 編輯會員(id, 重整); } });
    if (m.會籍狀態 === "申請中") 按鈕們.push({ 文字: "核准入會", 主: true, 動作: function (關) { 關(null); 核准入會([m], 重整); } });
    if (m.會籍狀態 === "有效") {
      按鈕們.push({ 文字: "辦理轉調", 動作: function (關) { 關(null); 辦理異動(m, "轉調", 重整); } });
      按鈕們.push({ 文字: "辦理退會", 危: true, 動作: function (關) { 關(null); 辦理異動(m, "退會", 重整); } });
    }
    if (m.會籍狀態 === "退會" || m.會籍狀態 === "停權") 按鈕們.push({ 文字: "辦理復會", 動作: function (關) { 關(null); 辦理異動(m, "復會", 重整); } });
    if (m.會籍狀態 === "申請中" || (!異動.length && !會費.length && !報名.length)) {
      按鈕們.push({ 文字: "刪除", 危: true, 動作: async function (關) {
        if (!(await 確認("確定刪除「" + m.姓名 + "」？（建議用「退會」保留紀錄；刪除後只剩操作紀錄）", "刪除"))) return false;
        刪除紀錄("會員", id); 關(null); 重整();
      } });
    }
  }
  按鈕們.push({ 文字: "關閉" });
  對話框(m.會員編號 + "　" + m.姓名, [
    基本,
    h("h3", null, "異動歷程"),
    小表(["日期", "類型", "說明", "原機關", "新機關", "經辦"], 異動.map(function (x) { return [民國(x.日期), x.類型, x.說明 || "", x.原機關 || "", x.新機關 || "", x.修改人 || ""]; })),
    h("h3", null, "會費紀錄"),
    小表(["年度", "項目", "金額", "繳費日", "收據號"], 會費.map(function (x) { return [民國年(x.年度), x.項目, 金額(x.金額), 民國(x.繳費日), x.收據號 || ""]; })),
    h("h3", null, "活動參與"),
    小表(["活動", "日期", "報名狀態", "簽到"], 報名.map(function (r) { const a = 找("活動", r.活動id) || {}; return [a.名稱 || "（已刪除）", 民國(a.日期), r.狀態, r.簽到時間 ? "已簽到" : "—"]; }))
  ], 按鈕們, { 寬: true });
}

// 辦理退會、轉調、復會：填日期與說明，寫入異動歷程並更新會員資料
function 辦理異動(m, 類型, 完成後) {
  const 設 = 狀態.資料.設定;
  const 欄位們 = [{ key: "日期", 標題: 類型 + "日期", 類型: "日期", 必填: true, 預設: 今天() }];
  if (類型 === "轉調") {
    欄位們.push({ key: "新機關", 標題: "轉調後服務機關", 類型: "選單", 選項: 設.服務機關, 必填: true });
    欄位們.push({ key: "新單位", 標題: "轉調後單位" });
    欄位們.push({ key: "新職稱", 標題: "轉調後職稱", 預設: m.職稱 });
  }
  欄位們.push({ key: "說明", 標題: "說明", 類型: "多行", 行數: 2 });
  return 表單對話框("辦理" + 類型 + "：" + m.姓名, 欄位們, {}, function (值) {
    const 異動 = { 會員id: m.id, 日期: 值.日期, 類型: 類型, 說明: 值.說明, 原機關: m.服務機關 || "" };
    if (類型 === "轉調") {
      異動.新機關 = 值.新機關;
      更新紀錄("會員", m.id, { 服務機關: 值.新機關, 單位: 值.新單位 || "", 職稱: 值.新職稱 || m.職稱 || "" }, "會員「" + m.姓名 + "」轉調");
    } else if (類型 === "退會") {
      更新紀錄("會員", m.id, { 會籍狀態: "退會", 退會日期: 值.日期 }, "會員「" + m.姓名 + "」退會");
    } else if (類型 === "復會") {
      異動.新機關 = m.服務機關 || "";
      更新紀錄("會員", m.id, { 會籍狀態: "有效", 退會日期: "" }, "會員「" + m.姓名 + "」復會");
    }
    新增紀錄("會員異動", 異動, "會員異動「" + m.姓名 + " " + 類型 + "」");
    提示("已辦理" + 類型);
    if (完成後) 完成後();
  });
}

// 核准入會申請：設為有效、寫入會日期與異動，可同時登記入會費
function 核准入會(會員們, 完成後) {
  const 設 = 狀態.資料.設定;
  const 欄位們 = [
    { key: "入會日期", 標題: "入會日期", 類型: "日期", 必填: true, 預設: 今天() },
    { key: "收入會費", 標題: "同時登記入會費", 類型: "勾選", 預設: Number(設.會費標準.入會費) > 0, 勾選文字: "收入會費 " + 金額(設.會費標準.入會費) + " 元" }
  ];
  return 表單對話框("核准入會（" + 會員們.length + " 人）", 欄位們, {}, function (值) {
    會員們.forEach(function (m) {
      更新紀錄("會員", m.id, { 會籍狀態: "有效", 入會日期: 值.入會日期 }, "核准「" + m.姓名 + "」入會");
      新增紀錄("會員異動", { 會員id: m.id, 日期: 值.入會日期, 類型: "入會", 說明: "核准入會申請", 新機關: m.服務機關 || "" }, "會員異動「" + m.姓名 + " 入會」");
    });
    if (值.收入會費 && Number(設.會費標準.入會費) > 0 && 可("會費.收繳")) {
      登記繳費({ 會員們: 會員們, 年度: Number(值.入會日期.slice(0, 4)), 項目: "入會費", 金額: Number(設.會費標準.入會費), 日期: 值.入會日期, 方式: "現金" });
    }
    提示("已核准入會");
    if (完成後) 完成後();
  });
}

// 顯示 Outlook 收件者字串（姓名 <email>; …），可一鍵複製
function 顯示收件者(列) {
  const 有信箱 = 列.filter(function (m) { return m.Email; });
  const 字串 = 有信箱.map(function (m) { return m.姓名.replace(/[<>;,"]/g, "") + " <" + m.Email + ">"; }).join("; ");
  const 框 = h("textarea", { rows: 6, readonly: true, id: "收件者字串" });
  框.value = 字串;
  對話框("Outlook 收件者", [
    h("p", null, "共 " + 有信箱.length + " 人有 Email" + (列.length > 有信箱.length ? "（" + (列.length - 有信箱.length) + " 人沒有 Email，未列入）" : "") + "。複製後貼到 Outlook 的「密件副本」欄。"),
    框
  ], [{ 文字: "關閉" }, {
    文字: "複製", 主: true, 動作: async function () {
      框.select();
      try { await navigator.clipboard.writeText(字串); 提示("已複製"); } catch (e) { 提示("請按 Ctrl+C 複製已選取的文字"); }
      return false;
    }
  }]);
}

// 匯出合併列印用的 CSV（Word 合併列印可直接使用）
function 匯出合併列印(列) {
  const 表 = [["姓名", "服務機關", "單位", "職稱", "公務電話", "Email", "會員編號"]].concat(列.map(function (m) {
    return [m.姓名, m.服務機關 || "", m.單位 || "", m.職稱 || "", m.公務電話 || "", m.Email || "", m.會員編號 || ""];
  }));
  匯出表格("合併列印名單_" + 今天(), 表, "csv");
}

// 批次加上或移除標籤
function 批次標籤(列, 加, 表) {
  const 設 = 狀態.資料.設定;
  表單對話框((加 ? "加上" : "移除") + "標籤（" + 列.length + " 人）", [{ key: "標籤", 標題: "標籤", 類型: "選單", 選項: 設.會員標籤, 必填: true }], {}, function (值) {
    列.forEach(function (m) {
      const 現 = (m.標籤 || []).slice();
      const i = 現.indexOf(值.標籤);
      if (加 && i < 0) 現.push(值.標籤);
      if (!加 && i >= 0) 現.splice(i, 1);
      更新紀錄("會員", m.id, { 標籤: 現 });
    });
    提示("已更新標籤");
    表.重繪();
  });
}

// 列印會員名冊（A4 直式）
function 列印名冊(列) {
  const 設 = 狀態.資料.設定;
  列印詢問(h("div", { class: "列印頁" },
    h("h1", null, 設.協會名稱 + " 會員名冊"),
    h("div", { class: "副標" }, "列印日期：" + 民國(今天()) + "　共 " + 列.length + " 人" + (設.範例資料 ? "　（範例資料）" : "")),
    h("table", { class: "表" }, h("thead", null, h("tr", null, ["編號", "姓名", "服務機關", "單位", "職稱", "公務電話", "會籍"].map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 列.map(function (m) { return h("tr", null, [m.會員編號, m.姓名, m.服務機關, m.單位, m.職稱, m.公務電話, m.會籍狀態].map(function (v) { return h("td", null, v || ""); })); })))));
}

// ===== 匯入名冊 =====

// 名冊欄位的常見別名（自動對應用）
const 匯入別名 = {
  姓名: ["姓名", "名字", "會員姓名", "name"],
  員工編號: ["員工編號", "員編", "人員代號", "職員編號"],
  服務機關: ["服務機關", "機關", "機關名稱", "服務單位機關"],
  單位: ["單位", "科室", "服務單位", "處室"],
  職稱: ["職稱", "職務"],
  公務電話: ["公務電話", "電話", "分機", "辦公室電話", "聯絡電話"],
  Email: ["email", "e-mail", "電子郵件", "信箱", "電子信箱", "公務信箱"],
  入會日期: ["入會日期", "入會日", "加入日期"],
  會員類別: ["會員類別", "類別"],
  會籍狀態: ["會籍狀態", "會籍", "狀態"],
  標籤: ["標籤", "分類標籤"],
  備註: ["備註", "說明"]
};

// 依標題文字猜對應的會員欄位
function 猜欄位(標題) {
  const t = String(標題 || "").trim().toLowerCase();
  for (const k of Object.keys(匯入別名)) if (匯入別名[k].some(function (a) { return a.toLowerCase() === t; })) return k;
  return "";
}

// 匯入名冊：選檔 → 對應欄位 → 比對重複 → 匯入
function 匯入會員(完成後) {
  選擇檔案(".xlsx,.ods,.csv").then(async function (檔們) {
    const f = 檔們[0];
    if (!f) return;
    try {
      const 列 = await 讀試算表(f);
      if (列.length < 2) { 提示("檔案裡沒有資料（第一列要是欄位標題）", true); return; }
      匯入對應對話框(f.name, 列, 完成後);
    } catch (e) {
      提示("讀取失敗：" + e.message, true);
    }
  });
}

// 欄位對應對話框：每個檔案欄位選要對應到哪個會員欄位，並選重複時怎麼處理
function 匯入對應對話框(檔名, 列, 完成後) {
  const 標題列 = 列[0];
  const 資料列 = 列.slice(1);
  const 目標 = Object.keys(匯入別名);
  const 選單們 = 標題列.map(function (t, i) {
    const 猜 = 猜欄位(t);
    return h("select", { dataset: { col: i }, "aria-label": "欄位 " + t },
      h("option", { value: "" }, "（不匯入）"), 目標.map(function (k) { return h("option", { value: k, selected: k === 猜 }, k); }));
  });
  const 重複處理 = h("select", { id: "重複處理" }, h("option", { value: "略過" }, "略過（不動既有資料）"), h("option", { value: "更新" }, "以檔案內容更新既有資料"));
  const 預覽 = h("table", { class: "表" },
    h("thead", null, h("tr", null, 標題列.map(function (t, i) { return h("th", null, t || "（第 " + (i + 1) + " 欄）", h("br"), 選單們[i]); }))),
    h("tbody", null, 資料列.slice(0, 5).map(function (r) { return h("tr", null, 標題列.map(function (_, i) { return h("td", null, r[i] || ""); })); })));
  對話框("匯入名冊：" + 檔名, [
    h("p", null, "共 " + 資料列.length + " 筆。請確認每一欄要對應到哪個欄位（已自動猜測）。下方只預覽前 5 筆。"),
    h("div", { class: "表捲" }, 預覽),
    h("p", null, h("label", null, "遇到重複會員（員工編號、Email 或 姓名＋機關相同）時：", 重複處理))
  ], [{ 文字: "取消" }, {
    文字: "開始匯入", 主: true, 動作: function () {
      const 對應 = {};
      選單們.forEach(function (s, i) { if (s.value) 對應[s.value] = i; });
      if (對應.姓名 == null) { 提示("至少要對應「姓名」欄位", true); return false; }
      const 結果 = 執行匯入(資料列, 對應, 重複處理.value);
      對話框("匯入結果", h("ul", null,
        h("li", null, "新增 " + 結果.新增 + " 人"), h("li", null, "更新 " + 結果.更新 + " 人"),
        h("li", null, "略過重複 " + 結果.略過 + " 人"), h("li", null, "資料不完整（沒有姓名）" + 結果.錯誤 + " 筆"),
        h("li", null, "記得按「存檔」")));
      if (完成後) 完成後();
      return true;
    }
  }], { 寬: true });
}

// 依欄位對應把每一列轉成會員資料並新增或更新；回傳統計
function 執行匯入(資料列, 對應, 重複處理) {
  const 設 = 狀態.資料.設定;
  const 統計 = { 新增: 0, 更新: 0, 略過: 0, 錯誤: 0 };
  資料列.forEach(function (r) {
    const 值 = {};
    Object.keys(對應).forEach(function (k) { 值[k] = String(r[對應[k]] == null ? "" : r[對應[k]]).trim(); });
    if (!值.姓名) { 統計.錯誤++; return; }
    if ("入會日期" in 值) 值.入會日期 = 解析日期(值.入會日期);
    if ("標籤" in 值) 值.標籤 = 值.標籤.split(/[、,，;；\s]+/).filter(Boolean);
    if (值.會籍狀態 && 會籍狀態們.indexOf(值.會籍狀態) < 0) 值.會籍狀態 = "有效";
    if (值.服務機關 && 設.服務機關.indexOf(值.服務機關) < 0) {
      // 機關名稱不在清單：試著補上「財政部」前綴比對
      const 試 = 設.服務機關.find(function (o) { return o === "財政部" + 值.服務機關 || o.replace(/^財政部/, "") === 值.服務機關; });
      if (試) 值.服務機關 = 試;
    }
    const 重複 = 找重複會員(值);
    if (重複) {
      if (重複處理 === "更新") {
        Object.keys(值).forEach(function (k) { if (值[k] === "" || (Array.isArray(值[k]) && !值[k].length)) delete 值[k]; });
        更新紀錄("會員", 重複.id, 值, "匯入更新「" + 重複.姓名 + "」");
        統計.更新++;
      } else 統計.略過++;
      return;
    }
    新增會員(Object.assign({ 會員類別: 設.會員類別[0], 會籍狀態: "有效", 入會日期: 今天(), 標籤: [] }, 值), "名冊匯入");
    統計.新增++;
  });
  記錄操作("匯入", "會員", "新增 " + 統計.新增 + "、更新 " + 統計.更新 + "、略過 " + 統計.略過);
  return 統計;
}

// 匯入官網產生的入會申請資料檔（可一次選多個），建立「申請中」的會員
function 匯入入會申請(完成後) {
  選擇檔案(".json", true).then(async function (檔們) {
    if (!檔們.length) return;
    let 新增 = 0, 重複 = 0, 錯誤 = 0;
    for (const f of 檔們) {
      try {
        const j = JSON.parse(await f.text());
        if (j.格式 !== "協會申請資料" || j.類型 !== "入會申請" || !j.資料 || !j.資料.姓名) { 錯誤++; continue; }
        const d = j.資料;
        const 值 = { 姓名: d.姓名, 員工編號: d.員工編號 || "", 服務機關: d.服務機關 || "", 單位: d.單位 || "", 職稱: d.職稱 || "",
          公務電話: d.公務電話 || "", Email: d.Email || "", 會員類別: 狀態.資料.設定.會員類別[0], 會籍狀態: "申請中",
          申請日期: String(j.申請時間 || "").slice(0, 10), 備註: d.備註 || "", 來源: "官網入會申請", 標籤: ["新進"] };
        if (找重複會員(值)) { 重複++; continue; }
        新增會員(值);
        新增++;
      } catch (e) { 錯誤++; }
    }
    對話框("匯入入會申請", h("ul", null, h("li", null, "新增申請 " + 新增 + " 件（會籍狀態：申請中，請審核後按「核准入會」）"),
      h("li", null, "與既有會員重複 " + 重複 + " 件（未匯入）"), h("li", null, "不是入會申請檔 " + 錯誤 + " 件")));
    if (完成後) 完成後();
  });
}
