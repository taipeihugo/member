// 檔案說明：活動報名（建立活動、名額與候補、報名名單、匯入官網報名檔、簽到、出席率、通知名單、成果紀錄與照片）

註冊頁面("活動報名", {
  圖示: "📅",
  說明: "先「新增活動」設定日期、名額、候補名額、截止日與費用；勾選「公開於官網」後，發布官網時會出現在活動頁供同仁報名。點活動進入後：「報名名單」可手動加入會員或非會員、匯入官網報名檔（超過名額自動列候補，有人取消時候補自動遞補）、列印簽到表；「簽到」可勾選或輸入員工編號按 Enter；「統計與通知」看出席率並取得未報名、未簽到名單；「成果紀錄」寫活動成果並上傳照片（存在協會資料夾的 附件/活動/）。",
  繪製: function (容器, 參數) {
    if (參數.活動id && 找("活動", 參數.活動id)) 繪製活動詳細(容器, 找("活動", 參數.活動id), 參數.頁籤);
    else 繪製活動列表(容器);
  }
});

// 活動欄位定義
function 活動欄位() {
  return [
    { key: "名稱", 標題: "活動名稱", 必填: true, 寬: true },
    { key: "類別", 標題: "類別", 類型: "選單", 選項: function () { return 狀態.資料.設定.活動類別; } },
    { key: "日期", 標題: "活動日期", 類型: "日期", 必填: true },
    { key: "開始時間", 標題: "開始時間", 類型: "時間" },
    { key: "結束時間", 標題: "結束時間", 類型: "時間" },
    { key: "地點", 標題: "地點" },
    { key: "名額", 標題: "名額（0＝不限）", 類型: "數字", 最小: 0, 預設: 0 },
    { key: "候補名額", 標題: "候補名額", 類型: "數字", 最小: 0, 預設: 0 },
    { key: "截止日", 標題: "報名截止日", 類型: "日期" },
    { key: "費用", 標題: "費用（元）", 類型: "金額", 最小: 0, 預設: 0 },
    { key: "說明", 標題: "活動說明", 類型: "多行", 行數: 4 },
    { key: "公開", 標題: "官網", 類型: "勾選", 勾選文字: "公開於官網（發布後同仁可報名）", 預設: true }
  ];
}

// 某活動的報名統計：正取、候補、取消、簽到人數與出席率
function 活動統計(活動id) {
  const 列 = 集合("報名").filter(function (r) { return r.活動id === 活動id; });
  const 正取 = 列.filter(function (r) { return r.狀態 === "正取"; });
  const 簽到 = 正取.filter(function (r) { return r.簽到時間; }).length;
  return {
    正取: 正取.length, 候補: 列.filter(function (r) { return r.狀態 === "候補"; }).length,
    取消: 列.filter(function (r) { return r.狀態 === "取消"; }).length, 簽到: 簽到,
    出席率: 正取.length ? Math.round(簽到 / 正取.length * 1000) / 10 : null
  };
}

// 活動目前的狀態文字（報名中、已截止、已結束）
function 活動狀態(a) {
  const 今 = 今天();
  if (a.日期 < 今) return "已結束";
  if (a.截止日 && a.截止日 < 今) return "已截止";
  return "報名中";
}

// 畫活動列表
function 繪製活動列表(容器) {
  const 可編 = 可("活動.編輯");
  const 表 = 資料表({
    匯出檔名: "活動列表",
    資料: function () { return 集合("活動"); },
    預設排序: { key: "日期", 反向: true },
    欄位: [
      { key: "日期", 標題: "日期", 顯示: function (r) { return 民國(r.日期); } },
      { key: "名稱", 標題: "活動名稱" },
      { key: "類別", 標題: "類別" },
      { key: "地點", 標題: "地點" },
      { key: "狀態", 標題: "狀態", 值: 活動狀態, 顯示: function (r) { const s = 活動狀態(r); return h("span", { class: "標記 " + (s === "報名中" ? "成" : s === "已截止" ? "警" : "") }, s); } },
      { key: "名額", 標題: "名額", 數字: true, 值: function (r) { return Number(r.名額) || 0; }, 顯示: function (r) { return Number(r.名額) ? String(r.名額) : "不限"; } },
      { key: "正取", 標題: "正取", 數字: true, 值: function (r) { return 活動統計(r.id).正取; } },
      { key: "候補", 標題: "候補", 數字: true, 值: function (r) { return 活動統計(r.id).候補; } },
      { key: "簽到", 標題: "簽到", 數字: true, 值: function (r) { return 活動統計(r.id).簽到; } },
      { key: "出席率", 標題: "出席率", 數字: true, 值: function (r) { const s = 活動統計(r.id); return r.日期 <= 今天() && s.出席率 != null ? s.出席率 : ""; }, 顯示: function (r) { const s = 活動統計(r.id); return r.日期 <= 今天() && s.出席率 != null ? s.出席率 + "%" : "—"; } },
      { key: "公開", 標題: "官網", 值: function (r) { return r.公開 ? "公開" : "—"; } }
    ],
    篩選: [
      { 標題: "類別", 選項: function () { return 狀態.資料.設定.活動類別; }, 取值: function (r) { return r.類別; } },
      { 標題: "狀態", 選項: ["報名中", "已截止", "已結束"], 取值: 活動狀態 }
    ],
    點列: function (r) { 前往("活動報名", { 活動id: r.id }); }
  });
  // 已結束活動的平均出席率
  const 已辦 = 集合("活動").filter(function (a) { return a.日期 <= 今天(); }).map(function (a) { return 活動統計(a.id); }).filter(function (s) { return s.正取; });
  const 總正取 = 已辦.reduce(function (s, x) { return s + x.正取; }, 0), 總簽到 = 已辦.reduce(function (s, x) { return s + x.簽到; }, 0);
  容器.appendChild(頁首("活動報名", [
    可編 ? h("button", { class: "鈕 主", type: "button", id: "新增活動鈕", onclick: function () { 編輯活動(null, function (a) { 前往("活動報名", { 活動id: a.id }); }); } }, "＋ 新增活動") : null,
    可編 ? h("button", { class: "鈕", type: "button", id: "匯入報名鈕", onclick: function () { 匯入報名檔(null, 表.重繪); } }, "匯入官網報名檔") : null
  ]));
  容器.appendChild(h("p", { class: "次要字" }, "已辦理 " + 已辦.length + " 場活動，整體出席率 " + (總正取 ? Math.round(總簽到 / 總正取 * 1000) / 10 : 0) + "%（簽到 " + 總簽到 + "／正取 " + 總正取 + "）"));
  容器.appendChild(表.元素);
}

// 新增或編輯活動；完成後呼叫 完成後(活動)
function 編輯活動(id, 完成後) {
  const 原 = id ? 找("活動", id) : null;
  const 選項 = {};
  if (原) {
    選項.額外按鈕 = [{
      文字: "刪除活動", 危: true, 動作: async function (關) {
        const n = 集合("報名").filter(function (r) { return r.活動id === id; }).length;
        if (!(await 確認("確定刪除「" + 原.名稱 + "」？" + (n ? "（含 " + n + " 筆報名紀錄一併刪除）" : ""), "刪除"))) return false;
        集合("報名").filter(function (r) { return r.活動id === id; }).forEach(function (r) { 刪除紀錄("報名", r.id); });
        刪除紀錄("活動", id);
        關(null);
        前往("活動報名");
      }
    }];
  }
  return 表單對話框(原 ? "編輯活動" : "新增活動", 活動欄位(), 原 || { 日期: 今天(), 公開: true }, function (值) {
    if (值.截止日 && 值.截止日 > 值.日期) return "報名截止日不能晚於活動日期";
    ["名額", "候補名額", "費用"].forEach(function (k) { 值[k] = Number(值[k]) || 0; });
    const a = 原 ? 更新紀錄("活動", id, 值) : 新增紀錄("活動", Object.assign({ 照片: [], 成果說明: "", 成果公開: false }, 值));
    提示("已儲存活動");
    if (完成後) 完成後(a);
  }, 選項);
}

// 加入一筆報名：依名額決定正取或候補；額滿回傳錯誤文字
function 加入報名(活動, 值) {
  const 列 = 集合("報名").filter(function (r) { return r.活動id === 活動.id; });
  const 已有 = 列.find(function (r) {
    return r.狀態 !== "取消" && ((值.會員id && r.會員id === 值.會員id) || (!值.會員id && r.姓名 === 值.姓名 && (r.員工編號 || "") === (值.員工編號 || "")));
  });
  if (已有) return 值.姓名 + " 已經報名過了（" + 已有.狀態 + "）";
  const 正取數 = 列.filter(function (r) { return r.狀態 === "正取"; }).length;
  const 候補數 = 列.filter(function (r) { return r.狀態 === "候補"; }).length;
  let 狀 = "正取";
  if (Number(活動.名額) && 正取數 >= Number(活動.名額)) {
    if (候補數 >= Number(活動.候補名額 || 0)) return "名額與候補都已額滿";
    狀 = "候補";
  }
  return 新增紀錄("報名", Object.assign({ 活動id: 活動.id, 報名時間: 現在(), 狀態: 狀, 簽到時間: "", 已繳費: false, 來源: "手動" }, 值),
    "報名「" + 活動.名稱 + "：" + 值.姓名 + "（" + 狀 + "）」");
}

// 從會員資料帶出報名欄位
function 會員報名資料(m) {
  return { 會員id: m.id, 姓名: m.姓名, 員工編號: m.員工編號 || "", 服務機關: m.服務機關 || "", 單位: m.單位 || "", Email: m.Email || "", 電話: m.公務電話 || "" };
}

// 取消報名：若取消的是正取，第一位候補自動遞補
function 取消報名(r) {
  const 原狀 = r.狀態;
  更新紀錄("報名", r.id, { 狀態: "取消", 簽到時間: "" }, "取消報名「" + r.姓名 + "」");
  if (原狀 !== "正取") return null;
  const 候補 = 集合("報名").filter(function (x) { return x.活動id === r.活動id && x.狀態 === "候補"; }).sort(function (a, b) { return 比較(a.報名時間, b.報名時間); })[0];
  if (候補) { 更新紀錄("報名", 候補.id, { 狀態: "正取" }, "候補遞補「" + 候補.姓名 + "」"); return 候補; }
  return null;
}

// 畫活動詳細頁（資訊＋四個頁籤）
function 繪製活動詳細(容器, a, 預設頁籤) {
  const 可編 = 可("活動.編輯");
  const 重畫 = function (頁籤) { 前往("活動報名", { 活動id: a.id, 頁籤: 頁籤 }); };
  容器.appendChild(頁首(a.名稱, [
    h("button", { class: "鈕", type: "button", onclick: function () { 前往("活動報名"); } }, "← 回活動列表"),
    可編 ? h("button", { class: "鈕", type: "button", id: "編輯活動鈕", onclick: function () { 編輯活動(a.id, function () { 重畫(); }); } }, "編輯活動") : null
  ]));
  const s = 活動統計(a.id);
  容器.appendChild(h("div", { class: "卡", style: "margin-bottom:1rem" },
    h("div", { class: "標籤組" },
      h("span", null, "📅 " + 民國(a.日期) + " " + (a.開始時間 || "") + (a.結束時間 ? "–" + a.結束時間 : "")),
      h("span", null, "📍 " + (a.地點 || "未定")),
      h("span", null, "名額 " + (Number(a.名額) || "不限") + (Number(a.候補名額) ? "＋候補 " + a.候補名額 : "")),
      h("span", null, "截止 " + (民國(a.截止日) || "未定")),
      h("span", null, "費用 " + (Number(a.費用) ? 金額(a.費用) + " 元" : "免費")),
      h("span", { class: "標記 " + (活動狀態(a) === "報名中" ? "成" : "") }, 活動狀態(a)),
      a.公開 ? h("span", { class: "標記 金" }, "官網公開") : null),
    h("p", { class: "次要字", style: "margin:.5rem 0 0" }, "正取 " + s.正取 + "、候補 " + s.候補 + "、已簽到 " + s.簽到 + (s.出席率 != null ? "、出席率 " + s.出席率 + "%" : "")),
    a.說明 ? h("p", { style: "white-space:pre-wrap;margin:.5rem 0 0" }, a.說明) : null));
  const 頁籤 = 建立頁籤(["報名名單", "簽到", "統計與通知", "成果紀錄"], 預設頁籤, function (名, 區) {
    if (名 === "報名名單") 繪製報名名單(區, a, 重畫);
    else if (名 === "簽到") 繪製簽到(區, a);
    else if (名 === "統計與通知") 繪製活動統計(區, a);
    else 繪製成果紀錄(區, a);
  });
  容器.appendChild(頁籤.元素);
}

// 「報名名單」頁籤
function 繪製報名名單(區, a, 重畫) {
  const 可編 = 可("活動.編輯");
  const 表 = 資料表({
    匯出檔名: a.名稱 + "_報名名單",
    資料: function () { return 集合("報名").filter(function (r) { return r.活動id === a.id; }); },
    預設排序: { key: "報名時間" },
    欄位: [
      { key: "姓名", 標題: "姓名" }, { key: "員工編號", 標題: "員工編號" }, { key: "服務機關", 標題: "服務機關" }, { key: "單位", 標題: "單位" },
      { key: "狀態", 標題: "狀態", 顯示: function (r) { return h("span", { class: "標記 " + ({ 正取: "成", 候補: "金", 取消: "危" }[r.狀態] || "") }, r.狀態); } },
      { key: "報名時間", 標題: "報名時間", 顯示: function (r) { return 民國時間(r.報名時間); } },
      { key: "來源", 標題: "來源" },
      { key: "已繳費", 標題: "繳費", 值: function (r) { return Number(a.費用) ? (r.已繳費 ? "已繳" : "未繳") : "免費"; } },
      { key: "簽到時間", 標題: "簽到", 顯示: function (r) { return r.簽到時間 ? "✔ " + 民國時間(r.簽到時間).slice(-5) : "—"; } }
    ],
    篩選: [{ 標題: "狀態", 選項: ["正取", "候補", "取消"], 取值: function (r) { return r.狀態; } }],
    批次: 可編 ? [
      { 文字: "取消報名", 動作: async function (列) {
        const 有效 = 列.filter(function (r) { return r.狀態 !== "取消"; });
        if (!有效.length || !(await 確認("確定取消 " + 有效.length + " 人的報名？正取取消後，候補會自動遞補。", "取消報名"))) return;
        const 遞補 = 有效.map(取消報名).filter(Boolean);
        提示("已取消" + (遞補.length ? "，遞補：" + 遞補.map(function (r) { return r.姓名; }).join("、") : ""));
        表.重繪();
      } },
      { 文字: "標記已繳費", 動作: function (列) { 列.forEach(function (r) { 更新紀錄("報名", r.id, { 已繳費: true }); }); 表.重繪(); } },
      { 文字: "複製 Outlook 收件者", 動作: function (列) { 顯示收件者(列); } }
    ] : [],
    工具: [
      可編 ? h("button", { class: "鈕 主 小", type: "button", id: "加入會員報名鈕", onclick: function () { 挑選會員報名(a, 表.重繪); } }, "＋ 會員報名") : null,
      可編 ? h("button", { class: "鈕 小", type: "button", onclick: function () { 非會員報名(a, 表.重繪); } }, "＋ 非會員") : null,
      可編 ? h("button", { class: "鈕 小", type: "button", onclick: function () { 匯入報名檔(a, 表.重繪); } }, "匯入官網報名檔") : null,
      h("button", { class: "鈕 小", type: "button", onclick: function () { 列印簽到表(a); } }, "列印簽到表")
    ]
  });
  區.appendChild(表.元素);
}

// 從名冊挑會員加入報名（可搜尋姓名、機關、員工編號）
function 挑選會員報名(a, 完成後) {
  const 已報 = new Set(集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 !== "取消"; }).map(function (r) { return r.會員id; }));
  const 搜 = h("input", { type: "search", placeholder: "輸入姓名、機關或員工編號", id: "挑選搜尋", style: "width:100%" });
  const 清單 = h("div", { class: "挑選清單" });
  const 訊息 = h("p", { class: "次要字", role: "status" });
  const 畫 = function () {
    const 字 = 搜.value.trim();
    清空(清單);
    集合("會員").filter(function (m) {
      return m.會籍狀態 === "有效" && !已報.has(m.id) && (!字 || (m.姓名 + (m.服務機關 || "") + (m.員工編號 || "")).indexOf(字) >= 0);
    }).slice(0, 50).forEach(function (m) {
      清單.appendChild(h("button", { type: "button", onclick: function () {
        const r = 加入報名(a, Object.assign(會員報名資料(m), { 來源: "手動" }));
        if (typeof r === "string") { 訊息.textContent = r; return; }
        已報.add(m.id);
        訊息.textContent = "已加入：" + m.姓名 + "（" + r.狀態 + "）";
        畫();
        if (完成後) 完成後();
      } }, m.姓名 + "　" + (m.服務機關 || "") + " " + (m.單位 || "") + (m.員工編號 ? "　#" + m.員工編號 : "")));
    });
  };
  搜.addEventListener("input", 畫);
  畫();
  對話框("加入會員報名：" + a.名稱, [搜, 訊息, 清單], [{ 文字: "完成" }], { 開啟後: function () { 搜.focus(); } });
}

// 非會員（例如眷屬、來賓）報名
function 非會員報名(a, 完成後) {
  return 表單對話框("非會員報名", [
    { key: "姓名", 標題: "姓名", 必填: true }, { key: "服務機關", 標題: "服務機關" }, { key: "單位", 標題: "單位" },
    { key: "電話", 標題: "電話" }, { key: "Email", 標題: "Email", 類型: "Email" }, { key: "備註", 標題: "備註" }
  ], {}, function (值) {
    const r = 加入報名(a, Object.assign({ 會員id: "", 員工編號: "", 來源: "手動（非會員）" }, 值));
    if (typeof r === "string") return r;
    提示("已加入：" + 值.姓名 + "（" + r.狀態 + "）");
    if (完成後) 完成後();
  });
}

// 匯入官網產生的報名資料檔（可多選）；活動 為 null 時依檔案裡的活動編號對應
function 匯入報名檔(活動, 完成後) {
  const 選 = h("input", { type: "file", accept: ".json", multiple: true, id: "匯入報名檔" });
  選.addEventListener("change", async function () {
    const 結果 = { 正取: 0, 候補: 0, 重複或額滿: [], 無法辨識: 0 };
    for (const f of Array.from(選.files)) {
      try {
        const j = JSON.parse(await f.text());
        if (j.格式 !== "協會申請資料" || j.類型 !== "活動報名" || !j.資料 || !j.資料.姓名) { 結果.無法辨識++; continue; }
        const a = 活動 || 找("活動", j.活動id) || 集合("活動").find(function (x) { return x.名稱 === j.活動名稱; });
        if (!a || (活動 && j.活動id && j.活動id !== 活動.id)) { 結果.無法辨識++; continue; }
        const d = j.資料;
        const 會員 = 找重複會員({ 姓名: d.姓名, 員工編號: d.員工編號, Email: d.Email, 服務機關: d.服務機關 });
        const 值 = 會員 ? 會員報名資料(會員) : { 會員id: "", 姓名: d.姓名, 員工編號: d.員工編號 || "", 服務機關: d.服務機關 || "", 單位: d.單位 || "", Email: d.Email || "", 電話: d.公務電話 || "" };
        值.來源 = "官網報名";
        值.備註 = d.備註 || "";
        const r = 加入報名(a, 值);
        if (typeof r === "string") 結果.重複或額滿.push(r);
        else { 更新紀錄("報名", r.id, { 報名時間: j.申請時間 || r.報名時間 }); 結果[r.狀態]++; }
      } catch (e) { 結果.無法辨識++; }
    }
    對話框("匯入報名檔結果", h("ul", null,
      h("li", null, "正取 " + 結果.正取 + " 人、候補 " + 結果.候補 + " 人"),
      結果.重複或額滿.length ? h("li", null, "未加入：" + 結果.重複或額滿.join("；")) : null,
      h("li", null, "無法辨識或找不到對應活動 " + 結果.無法辨識 + " 個檔案")));
    if (完成後) 完成後();
  });
  選.click();
}

// 列印簽到表（正取名單＋簽名欄）
function 列印簽到表(a) {
  const 設 = 狀態.資料.設定;
  const 名單 = 集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 === "正取"; }).sort(function (x, y) { return 比較(x.服務機關 + x.姓名, y.服務機關 + y.姓名); });
  列印詢問(h("div", { class: "列印頁" },
    h("h1", null, 設.協會名稱), h("div", { class: "副標" }, a.名稱 + "　簽到表" + (設.範例資料 ? "（範例資料）" : "")),
    h("div", { class: "副標" }, "日期：" + 民國(a.日期) + " " + (a.開始時間 || "") + "　地點：" + (a.地點 || "")),
    h("table", { class: "表" }, h("thead", null, h("tr", null, ["序", "服務機關", "單位", "姓名", "簽名"].map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 名單.map(function (r, i) { return h("tr", null, h("td", null, i + 1), h("td", null, r.服務機關), h("td", null, r.單位), h("td", null, r.姓名), h("td", { style: "width:35%;height:2.2em" }, "")); })))));
}

// 「簽到」頁籤：輸入員工編號或姓名按 Enter，或直接勾選
function 繪製簽到(區, a) {
  const 可編 = 可("活動.編輯");
  const 輸入 = h("input", { class: "簽到輸入", id: "簽到輸入", placeholder: "輸入員工編號或姓名，按 Enter 簽到", disabled: !可編 });
  const 訊息 = h("p", { role: "status", class: "次要字" });
  const 計數 = h("p", { style: "font-size:1.2rem;font-weight:700" });
  const 清單 = h("div", { class: "表捲" });
  const 畫 = function () {
    const 名單 = 集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 === "正取"; }).sort(function (x, y) { return 比較(x.姓名, y.姓名); });
    const 已 = 名單.filter(function (r) { return r.簽到時間; }).length;
    計數.textContent = "已簽到 " + 已 + "／" + 名單.length + " 人（出席率 " + (名單.length ? Math.round(已 / 名單.length * 1000) / 10 : 0) + "%）";
    清空(清單).appendChild(h("table", { class: "表" },
      h("thead", null, h("tr", null, h("th", null, "簽到"), h("th", null, "姓名"), h("th", null, "員工編號"), h("th", null, "服務機關"), h("th", null, "時間"))),
      h("tbody", null, 名單.map(function (r) {
        return h("tr", null,
          h("td", null, h("input", { type: "checkbox", "aria-label": "簽到 " + r.姓名, checked: !!r.簽到時間, disabled: !可編, onchange: function (e) {
            更新紀錄("報名", r.id, { 簽到時間: e.target.checked ? 現在() : "" }, (e.target.checked ? "簽到「" : "取消簽到「") + r.姓名 + "」");
            畫();
          } })),
          h("td", null, r.姓名), h("td", null, r.員工編號 || ""), h("td", null, r.服務機關 || ""), h("td", null, r.簽到時間 ? 民國時間(r.簽到時間).slice(-5) : ""));
      }))));
  };
  輸入.addEventListener("keydown", async function (e) {
    if (e.key !== "Enter") return;
    const 字 = 輸入.value.trim();
    if (!字) return;
    const 名單 = 集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 !== "取消"; });
    let 符合 = 名單.filter(function (r) { return r.員工編號 && r.員工編號 === 字; });
    if (!符合.length) 符合 = 名單.filter(function (r) { return r.姓名 === 字; });
    if (符合.length > 1) { 訊息.textContent = "有 " + 符合.length + " 位同名，請改輸入員工編號或直接勾選"; return; }
    let r = 符合[0];
    if (!r) {
      // 沒報名：如果是會員，詢問是否現場報名
      const m = 集合("會員").find(function (x) { return x.會籍狀態 === "有效" && (x.員工編號 === 字 || x.姓名 === 字); });
      if (!m) { 訊息.textContent = "查無「" + 字 + "」的報名資料"; 輸入.select(); return; }
      if (!(await 確認(m.姓名 + " 沒有報名，要現場加入並簽到嗎？", "現場報名並簽到"))) return;
      const 新 = 加入報名(Object.assign({}, a, { 名額: 0 }), Object.assign(會員報名資料(m), { 來源: "現場" }));
      if (typeof 新 === "string") { 訊息.textContent = 新; return; }
      r = 新;
    }
    if (r.狀態 === "候補") 更新紀錄("報名", r.id, { 狀態: "正取" }, "候補現場轉正取「" + r.姓名 + "」");
    if (r.簽到時間) 訊息.textContent = r.姓名 + " 已經簽到過了";
    else { 更新紀錄("報名", r.id, { 簽到時間: 現在() }, "簽到「" + r.姓名 + "」"); 訊息.textContent = "✔ " + r.姓名 + " 簽到完成"; }
    輸入.value = "";
    畫();
  });
  區.appendChild(輸入);
  區.appendChild(訊息);
  區.appendChild(計數);
  區.appendChild(清單);
  畫();
  setTimeout(function () { 輸入.focus(); }, 0);
}

// 「統計與通知」頁籤：出席率、各機關統計、未報名與未簽到名單
function 繪製活動統計(區, a) {
  const s = 活動統計(a.id);
  const 報名們 = 集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 === "正取"; });
  const 機關們 = {};
  報名們.forEach(function (r) {
    const k = r.服務機關 || "（未填）";
    機關們[k] = 機關們[k] || { 報名: 0, 簽到: 0 };
    機關們[k].報名++;
    if (r.簽到時間) 機關們[k].簽到++;
  });
  const 有報 = new Set(集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 !== "取消"; }).map(function (r) { return r.會員id; }));
  const 未報名 = 集合("會員").filter(function (m) { return m.會籍狀態 === "有效" && !有報.has(m.id); });
  const 未簽到 = 報名們.filter(function (r) { return !r.簽到時間; });
  const 名單卡 = function (標題, 名單, 檔名) {
    return h("div", { class: "卡" }, h("h2", null, 標題 + "（" + 名單.length + " 人）"),
      h("div", { class: "表工具列" },
        h("button", { class: "鈕 小", type: "button", disabled: !名單.length, onclick: function () { 顯示收件者(名單); } }, "複製 Outlook 收件者"),
        h("button", { class: "鈕 小", type: "button", disabled: !名單.length, onclick: function () {
          匯出表格(a.名稱 + "_" + 檔名, [["姓名", "服務機關", "單位", "Email", "電話"]].concat(名單.map(function (m) { return [m.姓名, m.服務機關 || "", m.單位 || "", m.Email || "", m.公務電話 || m.電話 || ""]; })), "csv");
        } }, "匯出 CSV")),
      h("p", { class: "小字 次要字" }, 名單.slice(0, 12).map(function (m) { return m.姓名; }).join("、") + (名單.length > 12 ? "…" : "")));
  };
  區.appendChild(h("div", { class: "格" },
    h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, "正取"), h("div", { class: "數字" }, s.正取), h("div", { class: "小字 次要字" }, "名額 " + (Number(a.名額) || "不限"))),
    h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, "候補"), h("div", { class: "數字" }, s.候補), h("div", { class: "小字 次要字" }, "取消 " + s.取消)),
    h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, "已簽到"), h("div", { class: "數字" }, s.簽到), h("div", { class: "小字 次要字" }, "未簽到 " + (s.正取 - s.簽到))),
    h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, "出席率"), h("div", { class: "數字", id: "出席率" }, s.出席率 == null ? "—" : s.出席率 + "%"), h("div", { class: "小字 次要字" }, "簽到／正取"))));
  區.appendChild(h("div", { class: "卡", style: "margin-top:1rem" }, h("h2", null, "各機關出席情形"),
    h("div", { class: "表捲" }, h("table", { class: "表" },
      h("thead", null, h("tr", null, h("th", null, "服務機關"), h("th", { class: "數" }, "正取"), h("th", { class: "數" }, "簽到"), h("th", { class: "數" }, "出席率"))),
      h("tbody", null, Object.keys(機關們).sort(比較).map(function (k) {
        const x = 機關們[k];
        return h("tr", null, h("td", null, k), h("td", { class: "數" }, x.報名), h("td", { class: "數" }, x.簽到), h("td", { class: "數" }, Math.round(x.簽到 / x.報名 * 1000) / 10 + "%"));
      }))))));
  區.appendChild(h("div", { class: "格2" }, 名單卡("通知名單：未報名的有效會員", 未報名, "未報名名單"), 名單卡("通知名單：已報名未簽到", 未簽到, "未簽到名單")));
}

// 「成果紀錄」頁籤：成果說明、是否公開、活動照片
function 繪製成果紀錄(區, a) {
  const 可編 = 可("活動.編輯");
  const 說明 = h("textarea", { rows: 5, id: "成果說明", disabled: !可編 });
  說明.value = a.成果說明 || "";
  const 公開 = h("input", { type: "checkbox", checked: !!a.成果公開, disabled: !可編 });
  const 牆 = h("div", { class: "相片牆" });
  const 畫照片 = async function () {
    清空(牆);
    for (const 路徑 of (a.照片 || [])) {
      const f = await 讀附件(路徑);
      const 圖 = h("img", { alt: 路徑.split("/").pop() });
      if (f) {
        const url = URL.createObjectURL(f);
        圖.addEventListener("load", function () { URL.revokeObjectURL(url); });
        圖.addEventListener("error", function () { URL.revokeObjectURL(url); });
        圖.src = url;
      }
      牆.appendChild(h("figure", null, 圖, h("figcaption", { class: "小字 次要字" }, f ? 路徑.split("/").pop().replace(/^[0-9a-f]{6}_/, "") : "（找不到檔案）",
        可編 ? h("button", { class: "鈕 小 文字", type: "button", onclick: async function () {
          if (!(await 確認("確定移除這張照片？", "移除"))) return;
          await 刪附件(路徑);
          更新紀錄("活動", a.id, { 照片: a.照片.filter(function (p) { return p !== 路徑; }) }, "移除活動照片");
          畫照片();
        } }, "移除") : null)));
    }
    if (!(a.照片 || []).length) 牆.appendChild(h("p", { class: "次要字" }, "還沒有照片"));
  };
  const 上傳 = h("input", { type: "file", accept: "image/*", multiple: true, id: "上傳照片", class: "隱藏" });
  上傳.addEventListener("change", async function () {
    try {
      const 新路徑 = [];
      for (const f of Array.from(上傳.files)) 新路徑.push(await 存附件(["活動", a.id], f));
      更新紀錄("活動", a.id, { 照片: (a.照片 || []).concat(新路徑) }, "上傳活動照片 " + 新路徑.length + " 張");
      提示("已上傳 " + 新路徑.length + " 張照片（檔案已存入協會資料夾，記得存檔）");
      上傳.value = "";
      畫照片();
    } catch (e) { 提示(e.message, true); }
  });
  區.appendChild(h("div", { class: "卡" },
    h("h2", null, "活動成果"), 說明,
    h("p", null, h("label", null, 公開, " 成果與照片公開於官網")),
    可編 ? h("button", { class: "鈕 主", type: "button", id: "儲存成果鈕", onclick: function () {
      更新紀錄("活動", a.id, { 成果說明: 說明.value.trim(), 成果公開: 公開.checked }, "活動成果「" + a.名稱 + "」");
      提示("已儲存成果紀錄");
    } }, "儲存成果") : null));
  區.appendChild(h("div", { class: "卡", style: "margin-top:1rem" },
    h("div", { class: "頁首" }, h("h2", { style: "margin:0" }, "活動照片"),
      可編 ? h("div", { class: "工具" }, h("button", { class: "鈕", type: "button", onclick: function () { 上傳.click(); } }, "上傳照片"), 上傳) : null),
    牆));
  畫照片();
}
