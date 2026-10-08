// 檔案說明：會費與帳務（常年會費逐人收繳、催繳名單與通知單、收據列印、收支記帳與傳票、收支決算表）

註冊頁面("會費與帳務", {
  圖示: "＄",
  可見: function () { return 可("帳務.檢視"); },
  說明: "「會費收繳」逐人登記本年度常年會費（可勾選多人一次登記），登記時自動開收據號並記一張收入傳票；點一列可列印收據或作廢。「催繳」列出還沒繳的人，可列印催繳通知單、複製 Outlook 收件者、記錄已催繳。「收支記帳」登記其他收入與支出，傳票號自動編。「收支決算表」依年度彙總各科目決算數，並與預算數比較，可列印與匯出；格式依銓敘部《公務人員協會財務處理作業規定》第六點（會計報告）辦理，正式報送前請再以該規定附件格式核對。會費標準與會計科目在「設定」修改。",
  繪製: 繪製會費帳務
});

// 畫出會費與帳務頁（四個頁籤）
function 繪製會費帳務(容器, 參數) {
  容器.appendChild(頁首("會費與帳務"));
  const 頁籤 = 建立頁籤(["會費收繳", "催繳", "收支記帳", "收支決算表"], 參數.頁籤, function (名, 區) {
    if (名 === "會費收繳") 繪製收繳(區);
    else if (名 === "催繳") 繪製催繳(區);
    else if (名 === "收支記帳") 繪製記帳(區);
    else 繪製決算表(區);
  });
  容器.appendChild(頁籤.元素);
}

// ===== 共用計算 =====

// 查某會員某年度某項目的繳費紀錄
function 繳費紀錄(會員id, 年度, 項目) {
  return 集合("會費").find(function (f) { return f.會員id === 會員id && Number(f.年度) === Number(年度) && f.項目 === (項目 || "常年會費"); }) || null;
}

// 某年度應繳常年會費的會員：目前有效、且在該年底前入會
function 應繳會員(年度) {
  return 集合("會員").filter(function (m) {
    return m.會籍狀態 === "有效" && (!m.入會日期 || m.入會日期 <= 年度 + "-12-31");
  });
}

// 某年度還沒繳常年會費的有效會員
function 未繳名單(年度) {
  return 應繳會員(年度).filter(function (m) { return !繳費紀錄(m.id, 年度, "常年會費"); });
}

// 產生下一個收據號（民國年-流水號，例：115-0001）
function 下一個收據號(年度) {
  const 前綴 = 民國年(年度) + "-";
  const 最大 = 集合("會費").reduce(function (m, f) {
    if (String(f.收據號 || "").indexOf(前綴) !== 0) return m;
    const n = Number(String(f.收據號).slice(前綴.length));
    return n > m ? n : m;
  }, 0);
  return 前綴 + 補零(最大 + 1, 4);
}

// 產生下一個傳票號（民國年＋收／支＋流水號，例：115收001）
function 下一個傳票號(日期, 收支) {
  const 前綴 = 民國年(String(日期).slice(0, 4)) + (收支 === "收入" ? "收" : "支");
  const 最大 = 集合("傳票").reduce(function (m, v) {
    if (String(v.傳票號 || "").indexOf(前綴) !== 0) return m;
    const n = Number(String(v.傳票號).slice(前綴.length));
    return n > m ? n : m;
  }, 0);
  return 前綴 + 補零(最大 + 1, 3);
}

// 依名稱找會計科目代碼（找不到回傳空字串）
function 科目代碼(名稱) {
  const s = 狀態.資料.設定.會計科目.find(function (k) { return k.名稱 === 名稱; });
  return s ? s.代碼 : "";
}

// 科目代碼轉成「代碼 名稱」
function 科目名稱(代碼) {
  const s = 狀態.資料.設定.會計科目.find(function (k) { return k.代碼 === 代碼; });
  return s ? s.名稱 : 代碼 || "";
}

// 登記繳費：每人一筆會費紀錄（含收據號），並合記一張收入傳票；回傳會費紀錄陣列
function 登記繳費(選項) {
  const 會員們 = 選項.會員們.filter(function (m) { return !繳費紀錄(m.id, 選項.年度, 選項.項目); });
  if (!會員們.length) return [];
  const 科目 = 科目代碼(選項.項目 === "入會費" ? "入會費收入" : "常年會費收入");
  const 傳票 = 新增紀錄("傳票", {
    傳票號: 下一個傳票號(選項.日期, "收入"), 日期: 選項.日期, 收支: "收入", 科目: 科目,
    金額: 選項.金額 * 會員們.length,
    摘要: 民國年(選項.年度) + " 年度" + 選項.項目 + "（" + (會員們.length === 1 ? 會員們[0].姓名 : 會員們.length + " 人") + "）",
    對象: 會員們.length === 1 ? 會員們[0].姓名 : "會員", 來源: "會費"
  });
  return 會員們.map(function (m) {
    return 新增紀錄("會費", {
      會員id: m.id, 姓名: m.姓名, 年度: Number(選項.年度), 項目: 選項.項目, 金額: 選項.金額, 繳費日: 選項.日期,
      方式: 選項.方式 || "現金", 收據號: 下一個收據號(選項.年度), 傳票id: 傳票.id, 經手人: 操作者()
    }, "會費「" + m.姓名 + " " + 民國年(選項.年度) + " 年度" + 選項.項目 + "」");
  });
}

// 作廢一筆繳費：刪除會費紀錄，並從對應傳票扣回金額（扣到 0 就刪除傳票）
function 作廢繳費(會費id) {
  const f = 找("會費", 會費id);
  if (!f) return;
  const v = f.傳票id ? 找("傳票", f.傳票id) : null;
  if (v) {
    const 剩 = Number(v.金額) - Number(f.金額);
    if (剩 <= 0) 刪除紀錄("傳票", v.id, "傳票「" + v.傳票號 + "」（繳費作廢）");
    else 更新紀錄("傳票", v.id, { 金額: 剩, 摘要: v.摘要 + "（" + f.姓名 + " 作廢）" });
  }
  刪除紀錄("會費", 會費id, "作廢收據「" + f.收據號 + "」");
}

// 產生一張收據（兩聯：收執聯、存根聯）
function 收據節點(f) {
  const 設 = 狀態.資料.設定;
  const 會員 = 找("會員", f.會員id) || {};
  const 一聯 = function (聯名) {
    return h("div", { class: "收據" },
      h("div", { class: "聯別" }, 聯名),
      h("h1", null, 設.協會名稱 + "　收據"),
      h("div", { class: "副標" }, "收據號：" + f.收據號 + (設.範例資料 ? "　（範例資料）" : "")),
      h("table", null, h("tbody", null,
        h("tr", null, h("td", null, "繳款人"), h("td", null, f.姓名 + (會員.會員編號 ? "（會員編號 " + 會員.會員編號 + "）" : ""))),
        h("tr", null, h("td", null, "服務機關"), h("td", null, (會員.服務機關 || "") + " " + (會員.單位 || ""))),
        h("tr", null, h("td", null, "繳費項目"), h("td", null, 民國年(f.年度) + " 年度" + f.項目)),
        h("tr", null, h("td", null, "金額"), h("td", null, "新臺幣 " + 國字金額(f.金額) + "（NT$ " + 金額(f.金額) + "）")),
        h("tr", null, h("td", null, "繳費日期"), h("td", null, 民國(f.繳費日) + "　繳費方式：" + (f.方式 || ""))))),
      h("div", { class: "簽名列" }, h("span", null, "理事長：＿＿＿＿＿"), h("span", null, "會計：＿＿＿＿＿"), h("span", null, "經手人：" + (f.經手人 || "＿＿＿＿＿"))));
  };
  return h("div", { class: "列印頁" }, 一聯("第一聯　收執聯（交繳款人）"), 一聯("第二聯　存根聯（協會存查）"));
}

// 年度下拉選單（從最早有資料的年度到明年）
function 年度選單(目前, 變更) {
  const 年們 = new Set([本年(), 本年() + 1]);
  集合("傳票").forEach(function (v) { if (v.日期) 年們.add(Number(v.日期.slice(0, 4))); });
  集合("會費").forEach(function (f) { 年們.add(Number(f.年度)); });
  const 選 = h("select", { "aria-label": "年度", onchange: function () { 變更(Number(選.value)); } },
    Array.from(年們).sort().reverse().map(function (y) { return h("option", { value: y, selected: y === 目前 }, 民國年(y) + " 年度"); }));
  return 選;
}

// ===== 會費收繳 =====

// 畫「會費收繳」頁籤
function 繪製收繳(區, 年度) {
  年度 = 年度 || 本年();
  清空(區);
  const 設 = 狀態.資料.設定;
  const 標準 = Number(設.會費標準.常年會費) || 0;
  const 可收 = 可("會費.收繳");
  // 每位應繳會員一列（加上該年度已繳但現在不是有效會員的人）
  const 列們 = function () {
    const 名單 = 應繳會員(年度).slice();
    集合("會費").forEach(function (f) {
      if (Number(f.年度) === 年度 && f.項目 === "常年會費" && !名單.some(function (m) { return m.id === f.會員id; })) {
        const m = 找("會員", f.會員id);
        if (m) 名單.push(m);
      }
    });
    return 名單.map(function (m) {
      const f = 繳費紀錄(m.id, 年度, "常年會費");
      return { id: m.id, 會員: m, 會費: f, 會員編號: m.會員編號, 姓名: m.姓名, 服務機關: m.服務機關, 狀態: f ? "已繳" : "未繳",
        繳費日: f ? f.繳費日 : "", 金額: f ? Number(f.金額) : 0, 收據號: f ? f.收據號 : "", 方式: f ? f.方式 : "" };
    });
  };
  const 統計 = h("p", { class: "次要字" });
  const 更新統計 = function () {
    const 全 = 列們();
    const 已 = 全.filter(function (r) { return r.會費; });
    const 收 = 已.reduce(function (s, r) { return s + r.金額; }, 0);
    統計.textContent = 民國年(年度) + " 年度常年會費標準 " + 金額(標準) + " 元：應繳 " + 全.length + " 人，已繳 " + 已.length + " 人（" + 金額(收) + " 元），未繳 " + (全.length - 已.length) + " 人；收繳率 " + (全.length ? Math.round(已.length / 全.length * 1000) / 10 : 0) + "%";
  };
  const 重整 = function () { 表.重繪(); 更新統計(); };
  const 表 = 資料表({
    匯出檔名: 民國年(年度) + "年度常年會費收繳",
    資料: 列們,
    預設排序: { key: "會員編號" },
    欄位: [
      { key: "會員編號", 標題: "編號" }, { key: "姓名", 標題: "姓名" }, { key: "服務機關", 標題: "服務機關" },
      { key: "狀態", 標題: "繳費狀態", 顯示: function (r) { return h("span", { class: "標記 " + (r.會費 ? "成" : "危") }, r.狀態); } },
      { key: "繳費日", 標題: "繳費日", 顯示: function (r) { return 民國(r.繳費日); } },
      { key: "金額", 標題: "金額", 數字: true, 顯示: function (r) { return r.會費 ? 金額(r.金額) : ""; } },
      { key: "收據號", 標題: "收據號" }, { key: "方式", 標題: "方式" }
    ],
    篩選: [
      { 標題: "狀態", 選項: ["已繳", "未繳"], 取值: function (r) { return r.狀態; } },
      { 標題: "機關", 選項: function () { return 設.服務機關; }, 取值: function (r) { return r.服務機關; } }
    ],
    點列: function (r) { 繳費明細(r, 年度, 重整); },
    批次: [
      可收 ? { 文字: "登記繳費", 動作: function (列) { 登記繳費對話框(列.filter(function (r) { return !r.會費; }).map(function (r) { return r.會員; }), 年度, 重整); } } : null,
      { 文字: "列印收據", 動作: function (列) {
        const 已 = 列.filter(function (r) { return r.會費; });
        if (!已.length) return 提示("勾選的人都還沒繳費", true);
        列印詢問(已.map(function (r) { return 收據節點(r.會費); }));
      } }
    ].filter(Boolean)
  });
  區.appendChild(h("div", { class: "表工具列" }, h("label", null, "年度 ", 年度選單(年度, function (y) { 繪製收繳(區, y); })),
    h("span", { class: "次要字 小字" }, "勾選未繳的會員後按「登記繳費」；點一列可列印收據或作廢")));
  區.appendChild(統計);
  區.appendChild(表.元素);
  更新統計();
}

// 登記繳費對話框：選繳費日期與方式
function 登記繳費對話框(會員們, 年度, 完成後) {
  if (!會員們.length) return 提示("勾選的人都已繳費", true);
  const 設 = 狀態.資料.設定;
  return 表單對話框("登記 " + 民國年(年度) + " 年度常年會費（" + 會員們.length + " 人）", [
    { key: "金額", 標題: "每人金額", 類型: "金額", 必填: true, 預設: 設.會費標準.常年會費, 最小: 0 },
    { key: "日期", 標題: "繳費日期", 類型: "日期", 必填: true, 預設: 今天() },
    { key: "方式", 標題: "繳費方式", 類型: "選單", 選項: ["現金", "轉帳", "薪資扣繳"], 必填: true, 預設: "現金" },
    { key: "列印", 標題: "收據", 類型: "勾選", 預設: 會員們.length === 1, 勾選文字: "登記後列印收據" }
  ], {}, function (值) {
    if (!(值.金額 > 0)) return "金額要大於 0";
    const 紀錄們 = 登記繳費({ 會員們: 會員們, 年度: 年度, 項目: "常年會費", 金額: 值.金額, 日期: 值.日期, 方式: 值.方式 });
    提示("已登記 " + 紀錄們.length + " 人繳費，記得存檔");
    if (完成後) 完成後();
    if (值.列印 && 紀錄們.length) 列印詢問(紀錄們.map(收據節點));
  });
}

// 一位會員的繳費明細：列印收據、作廢或登記
function 繳費明細(r, 年度, 完成後) {
  const 按鈕 = [{ 文字: "關閉" }];
  if (r.會費) {
    if (可("帳務.編輯")) 按鈕.unshift({ 文字: "作廢", 危: true, 動作: async function (關) {
      if (!(await 確認("確定作廢收據 " + r.收據號 + "？對應傳票金額會一併扣回。", "作廢"))) return false;
      作廢繳費(r.會費.id); 關(null); 完成後(); 提示("已作廢");
    } });
    按鈕.push({ 文字: "列印收據", 主: true, 動作: function (關) { 關(null); 列印詢問(收據節點(r.會費)); } });
  } else if (可("會費.收繳")) {
    按鈕.push({ 文字: "登記繳費", 主: true, 動作: function (關) { 關(null); 登記繳費對話框([r.會員], 年度, 完成後); } });
  }
  const 催 = 集合("催繳").filter(function (c) { return c.會員id === r.id && Number(c.年度) === 年度; });
  對話框(r.姓名 + "：" + 民國年(年度) + " 年度常年會費", [
    h("p", null, r.會費 ? "已於 " + 民國(r.繳費日) + " 繳納 " + 金額(r.金額) + " 元（" + r.方式 + "），收據號 " + r.收據號 + "。" : "尚未繳納。"),
    催.length ? h("p", { class: "次要字" }, "催繳紀錄：" + 催.map(function (c) { return 民國(c.日期) + "（" + c.方式 + "）"; }).join("、")) : null
  ], 按鈕);
}

// ===== 催繳 =====

// 畫「催繳」頁籤：未繳名單、催繳次數
function 繪製催繳(區, 年度) {
  年度 = 年度 || 本年();
  清空(區);
  const 設 = 狀態.資料.設定;
  const 列們 = function () {
    return 未繳名單(年度).map(function (m) {
      const 催 = 集合("催繳").filter(function (c) { return c.會員id === m.id && Number(c.年度) === 年度; }).sort(function (a, b) { return 比較(b.日期, a.日期); });
      return { id: m.id, 會員: m, 會員編號: m.會員編號, 姓名: m.姓名, 服務機關: m.服務機關, 單位: m.單位, Email: m.Email, 公務電話: m.公務電話, 催繳次數: 催.length, 最近催繳: 催[0] ? 催[0].日期 : "" };
    });
  };
  const 表 = 資料表({
    匯出檔名: 民國年(年度) + "年度常年會費催繳名單",
    資料: 列們,
    預設排序: { key: "會員編號" },
    欄位: [
      { key: "會員編號", 標題: "編號" }, { key: "姓名", 標題: "姓名" }, { key: "服務機關", 標題: "服務機關" }, { key: "單位", 標題: "單位" },
      { key: "公務電話", 標題: "公務電話" }, { key: "Email", 標題: "Email" },
      { key: "催繳次數", 標題: "催繳次數", 數字: true }, { key: "最近催繳", 標題: "最近催繳", 顯示: function (r) { return 民國(r.最近催繳); } }
    ],
    篩選: [{ 標題: "機關", 選項: function () { return 設.服務機關; }, 取值: function (r) { return r.服務機關; } }],
    批次: [
      { 文字: "列印催繳通知單", 動作: function (列) { 列印詢問(列.map(function (r) { return 催繳通知單(r.會員, 年度); })); } },
      { 文字: "複製 Outlook 收件者", 動作: function (列) { 顯示收件者(列.map(function (r) { return r.會員; })); } },
      可("會費.收繳") ? { 文字: "記錄已催繳", 動作: function (列) {
        表單對話框("記錄已催繳（" + 列.length + " 人）", [
          { key: "日期", 標題: "催繳日期", 類型: "日期", 必填: true, 預設: 今天() },
          { key: "方式", 標題: "催繳方式", 類型: "選單", 選項: ["Email", "紙本通知", "電話", "當面"], 必填: true, 預設: "Email" }
        ], {}, function (值) {
          列.forEach(function (r) { 新增紀錄("催繳", { 會員id: r.id, 年度: 年度, 日期: 值.日期, 方式: 值.方式 }, "催繳「" + r.姓名 + "」"); });
          提示("已記錄催繳"); 表.重繪();
        });
      } } : null
    ].filter(Boolean),
    空白文字: "本年度常年會費已全部收齊"
  });
  區.appendChild(h("div", { class: "表工具列" }, h("label", null, "年度 ", 年度選單(年度, function (y) { 繪製催繳(區, y); })),
    h("span", { class: "次要字 小字" }, "勾選後可列印通知單、複製收件者或記錄已催繳")));
  區.appendChild(表.元素);
}

// 產生一張催繳通知單
function 催繳通知單(m, 年度) {
  const 設 = 狀態.資料.設定;
  return h("div", { class: "列印頁" },
    h("h1", null, 設.協會名稱), h("div", { class: "副標" }, "常年會費繳納通知" + (設.範例資料 ? "（範例資料）" : "")),
    h("p", null, (m.服務機關 || "") + " " + (m.單位 || "") + "　" + m.姓名 + "　會員您好："),
    h("p", null, "感謝您對協會的支持。依本會章程，" + 民國年(年度) + " 年度常年會費為新臺幣 " + 金額(設.會費標準.常年會費) + " 元，經查您尚未繳納，敬請於方便時向協會承辦人繳納，或洽詢繳費方式。若已繳納，請忽略本通知，並請告知承辦人以便更正。"),
    h("p", null, "聯絡電話：" + (設.電話 || "　") + "　Email：" + (設.Email || "　")),
    h("p", { class: "右" }, 設.協會名稱 + "　敬啟　" + 民國(今天())));
}

// ===== 收支記帳 =====

// 傳票的欄位定義（科目決定是收入還是支出）
function 傳票欄位() {
  const 科目們 = 狀態.資料.設定.會計科目.map(function (k) { return { 值: k.代碼, 字: k.代碼 + " " + k.名稱 + "（" + k.類別 + "）" }; });
  return [
    { key: "日期", 標題: "日期", 類型: "日期", 必填: true, 預設: 今天() },
    { key: "科目", 標題: "會計科目", 類型: "選單", 選項: 科目們, 必填: true },
    { key: "金額", 標題: "金額", 類型: "金額", 必填: true, 最小: 0 },
    { key: "對象", 標題: "收款／付款對象" },
    { key: "摘要", 標題: "摘要", 必填: true, 寬: true },
    { key: "備註", 標題: "備註", 類型: "多行", 行數: 2 }
  ];
}

// 畫「收支記帳」頁籤
function 繪製記帳(區, 年度) {
  年度 = 年度 || 本年();
  清空(區);
  const 可編 = 可("帳務.編輯");
  const 列們 = function () {
    return 集合("傳票").filter(function (v) { return String(v.日期).slice(0, 4) === String(年度); });
  };
  const 合計 = h("p", { class: "次要字" });
  const 更新合計 = function () {
    const 全 = 列們();
    const 收 = 全.filter(function (v) { return v.收支 === "收入"; }).reduce(function (s, v) { return s + Number(v.金額); }, 0);
    const 支 = 全.filter(function (v) { return v.收支 === "支出"; }).reduce(function (s, v) { return s + Number(v.金額); }, 0);
    合計.textContent = 民國年(年度) + " 年度：收入 " + 金額(收) + " 元、支出 " + 金額(支) + " 元、結餘 " + 金額(收 - 支) + " 元（共 " + 全.length + " 張傳票）";
  };
  const 重整 = function () { 表.重繪(); 更新合計(); };
  const 表 = 資料表({
    匯出檔名: 民國年(年度) + "年度收支明細",
    資料: 列們,
    預設排序: { key: "日期", 反向: true },
    欄位: [
      { key: "傳票號", 標題: "傳票號" },
      { key: "日期", 標題: "日期", 顯示: function (r) { return 民國(r.日期); } },
      { key: "收支", 標題: "收支", 顯示: function (r) { return h("span", { class: "標記 " + (r.收支 === "收入" ? "成" : "警") }, r.收支); } },
      { key: "科目", 標題: "科目", 值: function (r) { return r.科目 + " " + 科目名稱(r.科目); } },
      { key: "摘要", 標題: "摘要" }, { key: "對象", 標題: "對象" },
      { key: "金額", 標題: "金額", 數字: true, 值: function (r) { return Number(r.金額); }, 顯示: function (r) { return 金額(r.金額); } }
    ],
    篩選: [
      { 標題: "收支", 選項: ["收入", "支出"], 取值: function (r) { return r.收支; } },
      { 標題: "月份", 選項: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(function (m) { return m + "月"; }), 取值: function (r) { return String(r.日期).slice(5, 7) + "月"; } },
      { 標題: "科目", 選項: function () { return 狀態.資料.設定.會計科目.map(function (k) { return k.名稱; }); }, 取值: function (r) { return 科目名稱(r.科目); } }
    ],
    點列: 可編 ? function (r) { 編輯傳票(r.id, 重整); } : null,
    工具: 可編 ? [h("button", { class: "鈕 主 小", type: "button", id: "新增傳票鈕", onclick: function () { 編輯傳票(null, 重整); } }, "＋ 記一筆")] : []
  });
  區.appendChild(h("div", { class: "表工具列" }, h("label", null, "年度 ", 年度選單(年度, function (y) { 繪製記帳(區, y); }))));
  區.appendChild(合計);
  區.appendChild(表.元素);
  更新合計();
}

// 新增或修改一張傳票（會費產生的傳票只能改摘要與備註）
function 編輯傳票(id, 完成後) {
  const 原 = id ? 找("傳票", id) : null;
  const 來自會費 = 原 && 原.來源 === "會費";
  const 欄位們 = 傳票欄位().map(function (f) { return 來自會費 && ["日期", "科目", "金額"].indexOf(f.key) >= 0 ? Object.assign({}, f, { 唯讀: true }) : f; });
  const 選項 = {};
  if (原) {
    // 編輯既有傳票時，額外提供刪除按鈕
    選項.額外按鈕 = [{
      文字: "刪除傳票", 危: true, 動作: async function (關) {
        if (來自會費) { 提示("這張傳票由會費收繳產生，請到「會費收繳」作廢該筆繳費", true); return false; }
        if (!(await 確認("確定刪除傳票 " + 原.傳票號 + "？", "刪除"))) return false;
        刪除紀錄("傳票", id);
        關(null);
        if (完成後) 完成後();
      }
    }];
  }
  return 表單對話框(原 ? "傳票 " + 原.傳票號 : "記一筆收支", 欄位們, 原 || {}, function (值) {
    if (來自會費) { 更新紀錄("傳票", id, { 摘要: 值.摘要, 對象: 值.對象, 備註: 值.備註 }); if (完成後) 完成後(); return; }
    if (!(值.金額 > 0)) return "金額要大於 0";
    const 科 = 狀態.資料.設定.會計科目.find(function (k) { return k.代碼 === 值.科目; });
    值.收支 = 科 ? 科.類別 : "支出";
    if (原) {
      if (原.收支 !== 值.收支 || 原.日期.slice(0, 4) !== 值.日期.slice(0, 4)) 值.傳票號 = 下一個傳票號(值.日期, 值.收支);
      更新紀錄("傳票", id, 值);
    } else {
      值.傳票號 = 下一個傳票號(值.日期, 值.收支);
      新增紀錄("傳票", 值);
    }
    提示("已記帳，記得存檔");
    if (完成後) 完成後();
  }, 選項);
}

// ===== 收支決算表 =====

// 計算某年度各科目的決算數、預算數與比較
function 決算資料(年度) {
  const 科目們 = 狀態.資料.設定.會計科目;
  const 傳票們 = 集合("傳票").filter(function (v) { return String(v.日期).slice(0, 4) === String(年度); });
  const 預算們 = 集合("預算").filter(function (b) { return Number(b.年度) === Number(年度); });
  const 列 = function (類別) {
    return 科目們.filter(function (k) { return k.類別 === 類別; }).map(function (k) {
      const 決算 = 傳票們.filter(function (v) { return v.科目 === k.代碼; }).reduce(function (s, v) { return s + Number(v.金額); }, 0);
      const 預 = 預算們.find(function (b) { return b.科目 === k.代碼; });
      const 預算 = 預 ? Number(預.金額) || 0 : 0;
      return { 代碼: k.代碼, 名稱: k.名稱, 決算: 決算, 預算: 預算, 差: 決算 - 預算, 說明: 預 ? 預.說明 || "" : "" };
    });
  };
  const 收入 = 列("收入"), 支出 = 列("支出");
  const 加總 = function (列們, k) { return 列們.reduce(function (s, r) { return s + r[k]; }, 0); };
  return {
    收入: 收入, 支出: 支出,
    收入合計: { 決算: 加總(收入, "決算"), 預算: 加總(收入, "預算") },
    支出合計: { 決算: 加總(支出, "決算"), 預算: 加總(支出, "預算") }
  };
}

// 產生收支決算表的表格（畫面與列印共用）
function 決算表格(年度) {
  const d = 決算資料(年度);
  const 數 = function (n) { return h("td", { class: "數" }, n ? 金額(n) : "0"); };
  const 增減 = function (差) { return [h("td", { class: "數" }, 差 > 0 ? 金額(差) : ""), h("td", { class: "數" }, 差 < 0 ? 金額(-差) : "")]; };
  const 科目列 = function (r) { return h("tr", null, h("td", null, "　" + r.名稱), 數(r.決算), 數(r.預算), 增減(r.差), h("td", null, r.說明)); };
  const 合計列 = function (名, t) { return h("tr", { style: "font-weight:700" }, h("td", null, 名), 數(t.決算), 數(t.預算), 增減(t.決算 - t.預算), h("td", null, "")); };
  const 餘絀決算 = d.收入合計.決算 - d.支出合計.決算, 餘絀預算 = d.收入合計.預算 - d.支出合計.預算;
  return h("table", { class: "表", id: "決算表" },
    h("thead", null,
      h("tr", null, h("th", { rowspan: 2 }, "科目"), h("th", { rowspan: 2, class: "數" }, "本年度決算數"), h("th", { rowspan: 2, class: "數" }, "本年度預算數"),
        h("th", { colspan: 2, class: "置中" }, "決算與預算比較"), h("th", { rowspan: 2 }, "說明")),
      h("tr", null, h("th", { class: "數" }, "增加"), h("th", { class: "數" }, "減少"))),
    h("tbody", null,
      h("tr", null, h("td", { colspan: 6, style: "font-weight:700" }, "收入")), d.收入.map(科目列), 合計列("收入合計", d.收入合計),
      h("tr", null, h("td", { colspan: 6, style: "font-weight:700" }, "支出")), d.支出.map(科目列), 合計列("支出合計", d.支出合計),
      h("tr", { style: "font-weight:700" }, h("td", null, 餘絀決算 >= 0 ? "本期賸餘" : "本期短絀"), 數(Math.abs(餘絀決算)), 數(Math.abs(餘絀預算)), 增減(餘絀決算 - 餘絀預算), h("td", null, ""))));
}

// 畫「收支決算表」頁籤
function 繪製決算表(區, 年度) {
  年度 = 年度 || 本年();
  清空(區);
  const 設 = 狀態.資料.設定;
  const 標頭 = function () {
    return [h("h1", null, 設.協會名稱), h("div", { class: "副標" }, "收支決算表" + (設.範例資料 ? "（範例資料）" : "")),
      h("div", { class: "副標" }, "中華民國 " + 民國年(年度) + " 年 1 月 1 日至 " + 民國年(年度) + " 年 12 月 31 日　　單位：新臺幣元")];
  };
  const 依據 = "格式依銓敘部《公務人員協會財務處理作業規定》第六點（會計報告）編製；會計科目依本會設定。報送主管機關前，請以該規定附件之格式與科目核對。";
  區.appendChild(h("div", { class: "表工具列" },
    h("label", null, "年度 ", 年度選單(年度, function (y) { 繪製決算表(區, y); })),
    h("div", { class: "右側" },
      可("帳務.編輯") ? h("button", { class: "鈕 小", type: "button", id: "編預算鈕", onclick: function () { 編輯預算(年度, function () { 繪製決算表(區, 年度); }); } }, "編列預算數／說明") : null,
      h("button", { class: "鈕 小", type: "button", onclick: function () { 匯出決算表(年度, "csv"); } }, "匯出 CSV"),
      h("button", { class: "鈕 小", type: "button", onclick: function () { 匯出決算表(年度, "xlsx"); } }, "匯出 Excel"),
      h("button", { class: "鈕 小 主", type: "button", id: "列印決算表鈕", onclick: function () {
        列印詢問(h("div", { class: "列印頁" }, 標頭(), 決算表格(年度), h("p", { class: "小字" }, 依據),
          h("div", { class: "簽名列" }, h("span", null, "理事長"), h("span", null, "秘書長"), h("span", null, "會計"), h("span", null, "製表"))));
      } }, "列印"))));
  區.appendChild(h("div", { class: "卡" }, h("div", { class: "置中" }, 標頭()), h("div", { class: "表捲" }, 決算表格(年度)), h("p", { class: "小字 次要字" }, 依據)));
}

// 匯出收支決算表
function 匯出決算表(年度, 格式) {
  const d = 決算資料(年度);
  const 表 = [["科目", "本年度決算數", "本年度預算數", "比較增加", "比較減少", "說明"]];
  const 加 = function (r, 名) { const 差 = r.決算 - r.預算; 表.push([名 || r.名稱, r.決算, r.預算, 差 > 0 ? 差 : 0, 差 < 0 ? -差 : 0, r.說明 || ""]); };
  表.push(["收入", "", "", "", "", ""]); d.收入.forEach(function (r) { 加(r); }); 加(d.收入合計, "收入合計");
  表.push(["支出", "", "", "", "", ""]); d.支出.forEach(function (r) { 加(r); }); 加(d.支出合計, "支出合計");
  加({ 決算: d.收入合計.決算 - d.支出合計.決算, 預算: d.收入合計.預算 - d.支出合計.預算 }, "本期餘絀");
  匯出表格(民國年(年度) + "年度收支決算表", 表, 格式);
}

// 編列某年度各科目預算數與說明
function 編輯預算(年度, 完成後) {
  const 科目們 = 狀態.資料.設定.會計科目;
  const 預算們 = 集合("預算").filter(function (b) { return Number(b.年度) === 年度; });
  const 欄位們 = [];
  const 初值 = {};
  科目們.forEach(function (k) {
    欄位們.push({ key: "金額_" + k.代碼, 標題: k.代碼 + " " + k.名稱 + "（" + k.類別 + "）", 類型: "金額", 最小: 0 });
    欄位們.push({ key: "說明_" + k.代碼, 標題: "說明" });
    const b = 預算們.find(function (x) { return x.科目 === k.代碼; });
    初值["金額_" + k.代碼] = b ? b.金額 : "";
    初值["說明_" + k.代碼] = b ? b.說明 || "" : "";
  });
  return 表單對話框(民國年(年度) + " 年度預算數", 欄位們, 初值, function (值) {
    科目們.forEach(function (k) {
      const 金 = 值["金額_" + k.代碼] === "" ? 0 : Number(值["金額_" + k.代碼]);
      const 說 = 值["說明_" + k.代碼] || "";
      const b = 預算們.find(function (x) { return x.科目 === k.代碼; });
      if (b) 更新紀錄("預算", b.id, { 金額: 金, 說明: 說 }, "預算「" + 民國年(年度) + " " + k.名稱 + "」");
      else if (金 || 說) 新增紀錄("預算", { 年度: 年度, 科目: k.代碼, 金額: 金, 說明: 說 }, "預算「" + 民國年(年度) + " " + k.名稱 + "」");
    });
    提示("已更新預算數");
    if (完成後) 完成後();
  }, { 寬: true });
}
