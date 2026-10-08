// 檔案說明：幹部功能（會員管理〔含理監事、會員代表、匯入匯出〕、入會審核、活動管理〔葷素統計、簽到〕、會費管理）

// ===== 會員管理 =====
註冊頁面("會員管理", {
  圖示: "👥",
  分隔: true,
  可見: 是幹部,
  說明: "管理全體會員。點一列可編輯：理監事職稱只能選一個（理事、監事互斥），「會員代表」可另外勾選，兩者可並存。幹部角色只有理事長、秘書長、總幹事能指派。「匯入名冊」支援 Excel／CSV／ODS，標準欄位為 姓名、女0男1、服務機關、服務單位、職稱、電子郵件信箱（可再加 公務電話、員工編號、理監事、會員代表）；Email 相同的會員會更新資料，其他新增。會員用個人 Email 註冊後，有兩種連結方式：勾選會員按「產生認領碼」交給本人輸入，或由會員送「連結申請」再到「申請審核」核准。「帳號」欄可篩出還沒連結的人。",
  繪製: async function (容器) {
    let 名冊 = await 查詢("members", null, "member_no.asc");
    const 統計 = h("p", { class: "次要字" });
    // 更新上方的人數統計（有效會員、理事、監事、會員代表）
    const 更新統計 = function () {
      const 有效 = 名冊.filter(function (m) { return m.status === "有效"; });
      const 數 = function (f) { return 有效.filter(f).length; };
      統計.textContent = "有效會員 " + 有效.length + " 人；理事 " + 數(function (m) { return m.board_role === "理事"; }) + " 人、監事 " +
        數(function (m) { return m.board_role === "監事"; }) + " 人、會員代表 " + 數(function (m) { return m.is_representative; }) + " 人。名冊含個資，請勿外流。";
    };
    const 重載 = async function () { 名冊 = await 查詢("members", null, "member_no.asc"); 表.重繪(); 更新統計(); };
    const 機關們 = function () { return Array.from(new Set(預設服務機關.concat(名冊.map(function (m) { return m.agency; }).filter(Boolean)))); };
    const 表 = 資料表({
      匯出檔名: "會員名冊",
      資料: function () { return 名冊; },
      預設排序: { key: "member_no" },
      欄位: [
        { key: "member_no", 標題: "編號" }, { key: "name", 標題: "姓名" }, { key: "gender", 標題: "性別" },
        { key: "agency", 標題: "服務機關" }, { key: "unit", 標題: "服務單位" }, { key: "title", 標題: "職稱" }, { key: "email", 標題: "Email" },
        { key: "職務", 標題: "協會職務", 值: 職務文字 },
        { key: "status", 標題: "會籍", 顯示: function (r) { return h("span", { class: "標記 " + (r.status === "有效" ? "成" : "危") }, r.status); } },
        { key: "帳號", 標題: "帳號", 值: function (r) { return r.user_id ? "已註冊" : "未註冊"; } }
      ],
      篩選: [
        { 標題: "機關", 選項: 機關們, 取值: function (r) { return r.agency; } },
        { 標題: "理監事", 選項: ["理事", "監事", "非理監事"], 取值: function (r) { return r.board_role || "非理監事"; } },
        { 標題: "會員代表", 選項: ["會員代表", "非會員代表"], 取值: function (r) { return r.is_representative ? "會員代表" : "非會員代表"; } },
        { 標題: "會籍", 選項: ["有效", "停權", "退會"], 取值: function (r) { return r.status; } },
        { 標題: "帳號", 選項: ["已註冊", "未註冊"], 取值: function (r) { return r.user_id ? "已註冊" : "未註冊"; } }
      ],
      點列: function (r) { 編輯線上會員(r, 機關們(), 重載); },
      批次: [
        { 文字: "產生認領碼", 動作: function (列) { 產生認領碼(列); } },
        { 文字: "複製 Email 收件者", 動作: function (列) { 顯示信箱(列); } }
      ]
    });
    容器.appendChild(頁首("會員管理", [
      h("button", { class: "鈕 主", type: "button", id: "新增會員鈕", onclick: function () { 編輯線上會員(null, 機關們(), 重載); } }, "＋ 新增會員"),
      h("button", { class: "鈕", type: "button", id: "匯入名冊鈕", onclick: function () { 匯入線上名冊(名冊, 重載); } }, "匯入名冊"),
      h("button", { class: "鈕", type: "button", id: "匯出標準名冊鈕", onclick: function () { 匯出標準格式(表.目前()); } }, "匯出名冊（標準格式）"),
      h("button", { class: "鈕 文字", type: "button", onclick: function () { 匯出表格("會員名冊匯入範本", [標準欄位, ["王小明（範例，請刪除此列）", 1, "財政部賦稅署", "稅制組", "科員", "example@example.org"]], "xlsx"); } }, "下載匯入範本")
    ]));
    更新統計();
    容器.appendChild(統計);
    容器.appendChild(表.元素);
  }
});

// 顯示 Email 收件者字串
function 顯示信箱(列) {
  const 字串 = 列.filter(function (m) { return m.email; }).map(function (m) { return m.name.replace(/[<>;,"]/g, "") + " <" + m.email + ">"; }).join("; ");
  const 框 = h("textarea", { rows: 6, readonly: true });
  框.value = 字串;
  對話框("Email 收件者", [h("p", null, "複製後貼到郵件的「密件副本」欄。"), 框], [{ 文字: "關閉" }]);
}

// 新增或編輯一位會員（理監事職稱單選，會員代表另外勾選）
function 編輯線上會員(原, 機關們, 完成後) {
  const 欄位們 = [
    { key: "name", 標題: "姓名", 必填: true }, { key: "gender", 標題: "性別", 類型: "選單", 選項: ["女", "男"] },
    { key: "employee_no", 標題: "員工編號" }, { key: "agency", 標題: "服務機關", 類型: "選單", 選項: 機關們, 必填: true },
    { key: "unit", 標題: "服務單位" }, { key: "title", 標題: "職稱" },
    { key: "email", 標題: "Email（會員用這個 Email 註冊）", 類型: "Email" }, { key: "phone", 標題: "公務電話" },
    { key: "join_date", 標題: "入會日期", 類型: "日期" }, { key: "status", 標題: "會籍", 類型: "選單", 選項: ["有效", "停權", "退會"], 必填: true },
    { key: "理監事", 標題: "理監事職稱（理事、監事只能擇一）", 類型: "選單", 選項: 理監事選項, 必填: true },
    { key: "is_representative", 標題: "會員代表", 類型: "勾選", 勾選文字: "是會員代表（可同時為理事或監事）" },
    { key: "staff_role", 標題: "幹部角色（可使用管理功能）", 類型: "選單", 選項: ["理事長", "秘書長", "總幹事", "會計", "承辦人"], 唯讀: !是管理者(), 說明: 是管理者() ? "" : "只有理事長、秘書長或總幹事可以指派" },
    { key: "note", 標題: "備註", 類型: "多行", 行數: 2 }
  ];
  const 初值 = 原 ? Object.assign({}, 原, { 理監事: 原.board_role ? 原.board_role + "|" + (原.board_title || 原.board_role) : "" }) : { status: "有效", join_date: 今天(), 理監事: "" };
  const 選項 = {};
  if (原 && 是管理者()) {
    選項.額外按鈕 = [];
    if (原.user_id) 選項.額外按鈕.push({ 文字: "解除帳號連結", 動作: async function (關) {
      if (!(await 確認("解除「" + 原.name + "」的帳號連結？他之後要重新用認領碼或連結申請連結。", "解除連結"))) return false;
      try { await 呼叫("unlink_member", { p_member: 原.id }); 關(null); 提示("已解除連結"); 完成後(); } catch (e) { 提示(e.message, true); return false; }
    } });
    選項.額外按鈕.push({ 文字: "刪除會員", 危: true, 動作: async function (關) {
      if (!(await 確認("確定刪除「" + 原.name + "」？報名與繳費紀錄會一併刪除。建議改用會籍「退會」保留紀錄。", "刪除"))) return false;
      try { await 刪除("members", { id: 原.id }); 關(null); 提示("已刪除"); 完成後(); } catch (e) { 提示(e.message, true); return false; }
    } });
  }
  return 表單對話框(原 ? "編輯會員：" + 原.name : "新增會員", 欄位們, 初值, async function (值) {
    const [角, 稱] = (值.理監事 || "|").split("|");
    const 資料 = {
      name: 值.name, gender: 值.gender, employee_no: 值.employee_no, agency: 值.agency, unit: 值.unit, title: 值.title,
      email: 值.email.toLowerCase(), phone: 值.phone, join_date: 值.join_date || null, status: 值.status,
      board_role: 角 || "", board_title: 稱 || "", is_representative: !!值.is_representative, note: 值.note
    };
    if (是管理者()) 資料.staff_role = 值.staff_role || "";
    try {
      if (原) await 修改("members", { id: 原.id }, 資料); else await 新增("members", 資料);
      提示("已儲存");
      if (原 && 原.user_id === 連線.帳號.id) await 重新讀取我的資料();
      完成後();
    } catch (e) { return e.message; }
  }, 選項);
}

// 標準名冊欄位（與會務管理系統相同）
const 標準欄位 = ["姓名", "女0男1", "服務機關", "服務單位", "職稱", "電子郵件信箱"];

// 匯出標準格式名冊
async function 匯出標準格式(列) {
  const 格式 = await 對話框("匯出名冊（標準格式）", [
    h("p", null, "欄位：" + 標準欄位.join("、") + "。共 " + 列.length + " 人（依目前的搜尋與篩選條件）。"),
    h("p", { class: "提醒" }, "名冊含個人資料，請只在協會幹部之間傳遞，用畢刪除。")
  ], [{ 文字: "取消" }, { 文字: "CSV", 值: "csv" }, { 文字: "Excel", 主: true, 值: "xlsx" }]);
  if (!格式) return;
  匯出表格("會員名冊_" + 今天(), [標準欄位].concat(列.map(function (m) {
    return [m.name, m.gender === "女" ? 0 : m.gender === "男" ? 1 : "", m.agency, m.unit, m.title, m.email];
  })), 格式);
}

// 名冊欄位名稱對照（匯入用）
const 線上匯入別名 = {
  name: ["姓名", "名字"], gender: ["女0男1", "性別", "性別(女0男1)", "性別（女0男1）"], agency: ["服務機關", "機關"],
  unit: ["服務單位", "單位", "科室"], title: ["職稱", "職務名稱"], email: ["電子郵件信箱", "email", "e-mail", "電子郵件", "信箱", "電子信箱"],
  phone: ["公務電話", "電話", "分機"], employee_no: ["員工編號", "員編"], 理監事: ["理監事", "理監事職稱", "協會職務"], 會員代表: ["會員代表"]
};

// 把名冊裡的理監事寫法轉成 [身分, 職稱]：理事長→[理事,理事長]、監事→[監事,監事]；空白回傳 ["",""]
function 轉理監事(v) {
  const s = String(v || "").trim();
  if (!s || s === "無") return ["", ""];
  if (["理事長", "常務理事", "理事"].indexOf(s) >= 0) return ["理事", s];
  if (["監事會召集人", "常務監事", "監事"].indexOf(s) >= 0) return ["監事", s];
  return null;
}

// 匯入名冊：讀檔、對應欄位、依 Email 比對（相同就更新，沒有就新增）
async function 匯入線上名冊(名冊, 完成後) {
  const f = (await 選擇檔案(".xlsx,.ods,.csv"))[0];
  if (!f) return;
  let 列;
  try { 列 = await 讀試算表(f); } catch (e) { return 提示("讀取失敗：" + e.message, true); }
  if (列.length < 2) return 提示("檔案裡沒有資料（第一列要是欄位標題）", true);
  const 標題 = 列[0].map(function (t) { return String(t || "").trim().toLowerCase(); });
  const 對應 = {};
  Object.keys(線上匯入別名).forEach(function (k) {
    const i = 標題.findIndex(function (t) { return 線上匯入別名[k].some(function (a) { return a.toLowerCase() === t; }); });
    if (i >= 0) 對應[k] = i;
  });
  if (對應.name == null) return 提示("找不到「姓名」欄", true);
  const 依信箱 = {};
  名冊.forEach(function (m) { if (m.email) 依信箱[m.email.toLowerCase()] = m; });
  const 新增們 = [], 更新們 = [], 問題 = [];
  列.slice(1).forEach(function (r, i) {
    const 取 = function (k) { return 對應[k] == null ? "" : String(r[對應[k]] == null ? "" : r[對應[k]]).trim(); };
    const 資料 = { name: 取("name") };
    if (!資料.name) return;
    if (對應.gender != null) { const g = 取("gender"); 資料.gender = g === "0" || g === "女" ? "女" : g === "1" || g === "男" ? "男" : ""; }
    ["agency", "unit", "title", "phone", "employee_no"].forEach(function (k) { if (對應[k] != null) 資料[k] = 取(k); });
    if (對應.email != null) 資料.email = 取("email").toLowerCase();
    if (對應.理監事 != null) {
      const 理 = 轉理監事(取("理監事"));
      if (!理) { 問題.push("第 " + (i + 2) + " 列「" + 資料.name + "」理監事欄看不懂（" + 取("理監事") + "），已略過這一欄"); }
      else { 資料.board_role = 理[0]; 資料.board_title = 理[1]; }
    }
    if (對應.會員代表 != null) 資料.is_representative = /^(1|是|y|yes|v|✔|ｖ)$/i.test(取("會員代表"));
    const 原 = 資料.email && 依信箱[資料.email];
    if (原) 更新們.push({ id: 原.id, 資料: 資料 });
    else { 新增們.push(Object.assign({ status: "有效", join_date: 今天() }, 資料)); if (資料.email) 依信箱[資料.email] = 資料; }
  });
  const 好 = await 對話框("匯入名冊：" + f.name, [
    h("p", null, "新增 " + 新增們.length + " 人、更新 " + 更新們.length + " 人（Email 相同的視為同一人）。"),
    h("p", { class: "次要字 小字" }, "對應到的欄位：" + Object.keys(對應).map(function (k) { return 列[0][對應[k]]; }).join("、")),
    問題.length ? h("ul", { class: "錯誤" }, 問題.slice(0, 10).map(function (p) { return h("li", null, p); })) : null
  ], [{ 文字: "取消" }, { 文字: "開始匯入", 主: true, 值: true }]);
  if (!好) return;
  try {
    for (let i = 0; i < 新增們.length; i += 200) await 新增("members", 新增們.slice(i, i + 200));
    for (const u of 更新們) await 修改("members", { id: u.id }, u.資料);
    提示("匯入完成：新增 " + 新增們.length + "、更新 " + 更新們.length);
  } catch (e) { 提示("匯入中斷：" + e.message, true); }
  完成後();
}

// ===== 認領碼 =====

// 替勾選的會員產生認領碼（已連結帳號的人略過），顯示清單並可列印紙條、匯出
async function 產生認領碼(列) {
  const 未連 = 列.filter(function (m) { return !m.user_id; });
  if (!未連.length) return 提示("勾選的會員都已連結帳號", true);
  if (!(await 確認("替 " + 未連.length + " 位尚未連結帳號的會員產生認領碼？（30 天有效；已有的舊碼會作廢）", "產生"))) return;
  let 碼們;
  try { 碼們 = await 呼叫("generate_claim_codes", { p_members: 未連.map(function (m) { return m.id; }) }); } catch (e) { return 提示(e.message, true); }
  const 依編號 = {};
  未連.forEach(function (m) { 依編號[m.id] = m; });
  const 列們 = 碼們.map(function (c) { const m = 依編號[c.member_id] || {}; return { 姓名: c.name, 機關: m.agency || "", 單位: m.unit || "", 碼: c.code, 到期: 民國(String(c.expires_at).slice(0, 10)) }; });
  const 網址 = location.origin + location.pathname;
  // 一張紙條：給會員的認領碼與操作步驟
  const 紙條 = function (r) {
    return h("div", { style: "border:1px dashed #555;padding:5mm;margin-bottom:4mm;page-break-inside:avoid" },
      h("strong", null, "財政部公務人員協會　會員專區認領碼"),
      h("p", { style: "margin:2mm 0" }, r.姓名 + "　" + r.機關 + " " + r.單位),
      h("p", { style: "margin:2mm 0;font-size:16pt;letter-spacing:2px" }, r.碼),
      h("p", { style: "margin:0;font-size:9pt" }, "1. 到 " + 網址 + " 用個人 Email 註冊並驗證　2. 登入後在「連結會員資料」輸入認領碼　（" + r.到期 + " 前有效，請勿交給他人）"));
  };
  對話框("認領碼（" + 列們.length + " 人）", [
    h("p", { class: "提醒" }, "認領碼等同開門鑰匙，請只交給會員本人（當面、紙條或私訊），不要張貼在群組。關閉這個視窗後無法再看到，需要時可重新產生。"),
    h("div", { class: "表捲" }, h("table", { class: "表", id: "認領碼表" },
      h("thead", null, h("tr", null, ["姓名", "服務機關", "服務單位", "認領碼", "有效期限"].map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 列們.map(function (r) { return h("tr", null, h("td", null, r.姓名), h("td", null, r.機關), h("td", null, r.單位), h("td", { style: "font-family:monospace;font-size:1.05rem" }, r.碼), h("td", null, r.到期)); }))))
  ], [
    { 文字: "匯出 Excel", 動作: function () { 匯出表格("認領碼_" + 今天(), [["姓名", "服務機關", "服務單位", "認領碼", "有效期限"]].concat(列們.map(function (r) { return [r.姓名, r.機關, r.單位, r.碼, r.到期]; })), "xlsx"); return false; } },
    { 文字: "列印紙條", 動作: function () { 列印(h("div", null, 列們.map(紙條)), false); return false; } },
    { 文字: "關閉", 主: true }
  ], { 寬: true });
}

// ===== 申請審核（入會申請、帳號連結申請）=====
註冊頁面("申請審核", {
  圖示: "✅",
  可見: 是幹部,
  說明: "「帳號連結」：已在名冊上的會員用個人 Email 註冊後送出的連結申請，請核對姓名、機關、公務信箱後，選擇名冊上對應的會員並核准。「入會申請」：還不是會員的同仁送出的申請，核准後建立會員資料並連結帳號（名冊已有相同公務信箱的會員時直接連結）。退回時填寫原因，申請人登入後看得到。",
  繪製: async function (容器, 參數) {
    const [申們, 連們, 名冊] = await Promise.all([查詢("applications", null, "created_at.desc"), 查詢("link_requests", null, "created_at.desc"), 查詢("members", null, "member_no.asc")]);
    const 待連 = 連們.filter(function (a) { return a.status === "待審"; }).length;
    const 待入 = 申們.filter(function (a) { return a.status === "待審"; }).length;
    容器.appendChild(頁首("申請審核"));
    const 頁籤 = 建立頁籤(["帳號連結（待審 " + 待連 + "）", "入會申請（待審 " + 待入 + "）"], 參數.頁籤, function (名, 區) {
      if (名.indexOf("帳號連結") === 0) 繪製連結審核(區, 連們, 名冊);
      else 繪製入會審核(區, 申們);
    });
    容器.appendChild(頁籤.元素);
  }
});

// 狀態標記
function 審核狀態(r) {
  return h("span", { class: "標記 " + ({ 待審: "金", 核准: "成", 退回: "危" }[r.status]) }, r.status);
}

// 「帳號連結」頁籤
function 繪製連結審核(區, 連們, 名冊) {
  區.appendChild(資料表({
    匯出檔名: "帳號連結申請",
    資料: function () { return 連們; },
    預設排序: { key: "created_at", 反向: true },
    欄位: [
      { key: "created_at", 標題: "申請時間", 顯示: function (r) { return 民國時間(r.created_at); } },
      { key: "name", 標題: "姓名" }, { key: "agency", 標題: "服務機關" }, { key: "unit", 標題: "服務單位" },
      { key: "office_email", 標題: "公務信箱" }, { key: "login_email", 標題: "登入 Email（個人）" },
      { key: "status", 標題: "狀態", 顯示: 審核狀態 },
      { key: "操作", 標題: "", 不排序: true, 不匯出: true, 顯示: function (r) {
        if (r.status !== "待審") return h("span", { class: "小字 次要字" }, (r.reviewed_by || "") + " " + 民國時間(r.reviewed_at));
        return [h("button", { class: "鈕 小 主", type: "button", onclick: function (e) { e.stopPropagation(); 核准連結(r, 名冊); } }, "核准"), " ",
          h("button", { class: "鈕 小 危", type: "button", onclick: function (e) { e.stopPropagation(); 退回申請("reject_link_request", r); } }, "退回")];
      } }
    ],
    篩選: [{ 標題: "狀態", 選項: ["待審", "核准", "退回"], 取值: function (r) { return r.status; } }],
    空白文字: "沒有帳號連結申請"
  }).元素);
}

// 核准連結：選名冊上對應的會員（預先選公務信箱相同、或姓名相同的人）
function 核准連結(r, 名冊) {
  const 可選 = 名冊.filter(function (m) { return !m.user_id; });
  const 建議 = 可選.find(function (m) { return r.office_email && m.email === r.office_email; }) ||
    可選.find(function (m) { return m.name === r.name && m.agency === r.agency; }) || 可選.find(function (m) { return m.name === r.name; });
  表單對話框("核准帳號連結：" + r.name, [
    { key: "member", 標題: "對應到名冊上的會員（只列出尚未連結帳號的人）", 類型: "選單", 必填: true, 寬: true,
      選項: 可選.map(function (m) { return { 值: m.id, 字: m.member_no + " " + m.name + "（" + (m.agency || "") + " " + (m.unit || "") + "，" + (m.email || "無信箱") + "）" }; }) }
  ], { member: 建議 ? 建議.id : "" }, async function (值) {
    try { await 呼叫("approve_link_request", { p_request: r.id, p_member: 值.member }); 提示("已連結：" + r.name); 重新繪製(); } catch (e) { return e.message; }
  }, { 儲存文字: "核准連結" });
}

// 退回申請（入會或連結），需填原因
function 退回申請(函式, r) {
  表單對話框("退回申請：" + r.name, [{ key: "原因", 標題: "退回原因（申請人看得到）", 類型: "多行", 行數: 3, 必填: true }], {}, async function (值) {
    const 參 = 函式 === "reject_application" ? { p_application: r.id, p_reason: 值.原因 } : { p_request: r.id, p_reason: 值.原因 };
    try { await 呼叫(函式, 參); 提示("已退回"); 重新繪製(); } catch (err) { return err.message; }
  });
}

// 「入會申請」頁籤
function 繪製入會審核(區, 申們) {
  區.appendChild(資料表({
    匯出檔名: "入會申請",
    資料: function () { return 申們; },
    預設排序: { key: "created_at", 反向: true },
    欄位: [
      { key: "created_at", 標題: "申請時間", 顯示: function (r) { return 民國時間(r.created_at); } },
      { key: "name", 標題: "姓名" }, { key: "gender", 標題: "性別" }, { key: "agency", 標題: "服務機關" }, { key: "unit", 標題: "服務單位" },
      { key: "title", 標題: "職稱" }, { key: "email", 標題: "公務信箱" },
      { key: "status", 標題: "狀態", 顯示: 審核狀態 },
      { key: "操作", 標題: "", 不排序: true, 不匯出: true, 顯示: function (r) {
        if (r.status !== "待審") return h("span", { class: "小字 次要字" }, (r.reviewed_by || "") + " " + 民國時間(r.reviewed_at));
        return [h("button", { class: "鈕 小 主", type: "button", onclick: async function (e) {
          e.stopPropagation();
          if (!(await 確認("核准「" + r.name + "」入會？", "核准"))) return;
          try { await 呼叫("approve_application", { p_application: r.id }); 提示("已核准"); 重新繪製(); } catch (err) { 提示(err.message, true); }
        } }, "核准"), " ", h("button", { class: "鈕 小 危", type: "button", onclick: function (e) { e.stopPropagation(); 退回申請("reject_application", r); } }, "退回")];
      } }
    ],
    篩選: [{ 標題: "狀態", 選項: ["待審", "核准", "退回"], 取值: function (r) { return r.status; } }],
    空白文字: "沒有入會申請"
  }).元素);
}

// ===== 活動管理 =====
註冊頁面("活動管理", {
  圖示: "🗓",
  可見: 是幹部,
  說明: "新增活動時可勾選「報名需選葷素」。點活動進入報名名單：可看正取、候補、葷素人數，勾選後簽到、標記已繳費或取消報名（正取取消時候補自動遞補），也可以代會員報名、匯出名單。",
  繪製: async function (容器, 參數) {
    if (參數.活動) return 繪製活動名單(容器, 參數.活動);
    const [活動們, 人數] = await Promise.all([查詢("activities", null, "date.desc"), 呼叫("activity_counts")]);
    const 數 = {};
    (人數 || []).forEach(function (x) { 數[x.activity_id] = x; });
    容器.appendChild(頁首("活動管理", [h("button", { class: "鈕 主", type: "button", id: "新增活動鈕", onclick: function () { 編輯線上活動(null); } }, "＋ 新增活動")]));
    容器.appendChild(資料表({
      匯出檔名: "活動列表",
      資料: function () { return 活動們; },
      預設排序: { key: "date", 反向: true },
      欄位: [
        { key: "date", 標題: "日期", 顯示: function (r) { return 民國(r.date); } }, { key: "name", 標題: "活動名稱" }, { key: "location", 標題: "地點" },
        { key: "capacity", 標題: "名額", 數字: true, 顯示: function (r) { return r.capacity ? String(r.capacity) : "不限"; } },
        { key: "正取", 標題: "正取", 數字: true, 值: function (r) { return (數[r.id] || {}).confirmed || 0; } },
        { key: "候補", 標題: "候補", 數字: true, 值: function (r) { return (數[r.id] || {}).waitlisted || 0; } },
        { key: "meal_option", 標題: "葷素", 值: function (r) { return r.meal_option ? "需選" : ""; } },
        { key: "is_public", 標題: "公開", 值: function (r) { return r.is_public ? "公開" : "不公開"; } }
      ],
      點列: function (r) { 前往("活動管理", { 活動: r.id }); }
    }).元素);
  }
});

// 新增或編輯活動
function 編輯線上活動(原) {
  const 欄位們 = [
    { key: "name", 標題: "活動名稱", 必填: true, 寬: true }, { key: "category", 標題: "類別" },
    { key: "date", 標題: "活動日期", 類型: "日期", 必填: true }, { key: "start_time", 標題: "開始時間", 類型: "時間" }, { key: "end_time", 標題: "結束時間", 類型: "時間" },
    { key: "location", 標題: "地點" }, { key: "capacity", 標題: "名額（0＝不限）", 類型: "數字", 最小: 0, 預設: 0 },
    { key: "waitlist", 標題: "候補名額", 類型: "數字", 最小: 0, 預設: 0 }, { key: "deadline", 標題: "報名截止日", 類型: "日期" },
    { key: "fee", 標題: "費用（元）", 類型: "金額", 最小: 0, 預設: 0 },
    { key: "meal_option", 標題: "用餐", 類型: "勾選", 勾選文字: "報名需選葷食或素食" },
    { key: "is_public", 標題: "開放報名", 類型: "勾選", 勾選文字: "公開在會員專區供報名", 預設: true },
    { key: "description", 標題: "活動說明", 類型: "多行", 行數: 4 }
  ];
  const 選項 = {};
  if (原) 選項.額外按鈕 = [{ 文字: "刪除活動", 危: true, 動作: async function (關) {
    if (!(await 確認("確定刪除「" + 原.name + "」？報名紀錄會一併刪除。", "刪除"))) return false;
    try { await 刪除("activities", { id: 原.id }); 關(null); 前往("活動管理"); } catch (e) { 提示(e.message, true); return false; }
  } }];
  return 表單對話框(原 ? "編輯活動" : "新增活動", 欄位們, 原 || { date: 今天(), is_public: true }, async function (值) {
    if (值.deadline && 值.deadline > 值.date) return "報名截止日不能晚於活動日期";
    const 資料 = Object.assign({}, 值, { capacity: Number(值.capacity) || 0, waitlist: Number(值.waitlist) || 0, fee: Number(值.fee) || 0, deadline: 值.deadline || null });
    try {
      const r = 原 ? await 修改("activities", { id: 原.id }, 資料) : await 新增("activities", 資料);
      提示("已儲存活動");
      前往("活動管理", { 活動: (r[0] || 原).id });
    } catch (e) { return e.message; }
  }, 選項);
}

// 活動報名名單：正取、候補、葷素統計、簽到、繳費、取消、代為報名、匯出
async function 繪製活動名單(容器, 活動id) {
  const [活, 報名們, 名冊] = await Promise.all([查詢("activities", { id: 活動id }), 查詢("registrations", { activity_id: 活動id }, "created_at.asc"), 查詢("members", null, "member_no.asc")]);
  const a = 活[0];
  if (!a) { 容器.appendChild(h("p", null, "找不到活動")); return; }
  const 依編號 = {};
  名冊.forEach(function (m) { 依編號[m.id] = m; });
  const 列們 = 報名們.map(function (r) {
    const m = 依編號[r.member_id] || {};
    return Object.assign({}, r, { 姓名: m.name || "", 機關: m.agency || "", 單位: m.unit || "", Email: m.email || "", email: m.email || "", name: m.name || "" });
  });
  const 有效 = 列們.filter(function (r) { return r.status !== "取消"; });
  const 計 = function (條件) { return 有效.filter(條件).length; };
  容器.appendChild(頁首(a.name, [
    h("button", { class: "鈕", type: "button", onclick: function () { 前往("活動管理"); } }, "← 回活動列表"),
    h("button", { class: "鈕", type: "button", id: "編輯活動鈕", onclick: function () { 編輯線上活動(a); } }, "編輯活動"),
    h("button", { class: "鈕 主", type: "button", id: "代為報名鈕", onclick: function () { 代為報名(a, 名冊, 有效); } }, "代會員報名")]));
  容器.appendChild(h("p", { class: "次要字" }, 民國(a.date) + " " + (a.start_time || "") + "　" + (a.location || "") + "　名額 " + (a.capacity || "不限") + (a.waitlist ? "＋候補 " + a.waitlist : "")));
  容器.appendChild(h("div", { class: "格" },
    ["正取", "候補"].map(function (s) { return h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, s), h("div", { class: "數字" }, 計(function (r) { return r.status === s; }))); }),
    a.meal_option ? ["葷", "素"].map(function (s) { return h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, s + "食（正取＋候補）"), h("div", { class: "數字", id: "葷素_" + s }, 計(function (r) { return r.meal === s; }))); }) : null,
    h("div", { class: "卡 數字卡" }, h("div", { class: "標" }, "已簽到"), h("div", { class: "數字" }, 計(function (r) { return r.checked_in_at; })))));
  const 批次改 = async function (列, 資料, 說明) {
    try { for (const r of 列) await 修改("registrations", { id: r.id }, 資料); 提示(說明); 重新繪製(); } catch (e) { 提示(e.message, true); }
  };
  容器.appendChild(h("div", { style: "margin-top:1rem" }, 資料表({
    匯出檔名: a.name + "_報名名單",
    資料: function () { return 列們; },
    預設排序: { key: "created_at" },
    欄位: [
      { key: "姓名", 標題: "姓名" }, { key: "機關", 標題: "服務機關" }, { key: "單位", 標題: "服務單位" },
      { key: "status", 標題: "狀態", 顯示: function (r) { return h("span", { class: "標記 " + ({ 正取: "成", 候補: "金", 取消: "危" }[r.status]) }, r.status); } },
      { key: "meal", 標題: "葷素" }, { key: "note", 標題: "備註" },
      { key: "created_at", 標題: "報名時間", 顯示: function (r) { return 民國時間(r.created_at); } },
      { key: "paid", 標題: "繳費", 值: function (r) { return a.fee ? (r.paid ? "已繳" : "未繳") : "免費"; } },
      { key: "checked_in_at", 標題: "簽到", 值: function (r) { return r.checked_in_at ? "已簽到" : ""; } }
    ],
    篩選: [
      { 標題: "狀態", 選項: ["正取", "候補", "取消"], 取值: function (r) { return r.status; } },
      { 標題: "葷素", 選項: ["葷", "素"], 取值: function (r) { return r.meal; } }
    ],
    批次: [
      { 文字: "簽到", 動作: function (列) { 批次改(列.filter(function (r) { return r.status !== "取消"; }), { checked_in_at: new Date().toISOString() }, "已簽到"); } },
      { 文字: "取消簽到", 動作: function (列) { 批次改(列, { checked_in_at: null }, "已取消簽到"); } },
      { 文字: "標記已繳費", 動作: function (列) { 批次改(列, { paid: true }, "已標記繳費"); } },
      { 文字: "取消報名", 動作: async function (列) {
        const 可取消 = 列.filter(function (r) { return r.status !== "取消"; });
        if (!可取消.length || !(await 確認("取消 " + 可取消.length + " 人的報名？正取取消後候補會自動遞補。", "取消報名"))) return;
        try { for (const r of 可取消) await 呼叫("cancel_registration", { p_registration: r.id }); 提示("已取消"); 重新繪製(); } catch (e) { 提示(e.message, true); }
      } },
      { 文字: "複製 Email 收件者", 動作: function (列) { 顯示信箱(列); } }
    ]
  }).元素));
}

// 幹部代會員報名（依名額決定正取或候補）
function 代為報名(a, 名冊, 有效報名) {
  const 已報 = new Set(有效報名.map(function (r) { return r.member_id; }));
  const 可選 = 名冊.filter(function (m) { return m.status === "有效" && !已報.has(m.id); });
  const 欄位們 = [{ key: "member", 標題: "會員", 類型: "選單", 必填: true, 選項: 可選.map(function (m) { return { 值: m.id, 字: m.member_no + " " + m.name + "（" + (m.agency || "") + "）" }; }) }];
  if (a.meal_option) 欄位們.push({ key: "meal", 標題: "用餐", 類型: "選單", 選項: [{ 值: "葷", 字: "葷食" }, { 值: "素", 字: "素食" }], 必填: true });
  欄位們.push({ key: "note", 標題: "備註" });
  表單對話框("代會員報名：" + a.name, 欄位們, {}, async function (值) {
    const 正取 = 有效報名.filter(function (r) { return r.status === "正取"; }).length;
    const 候補 = 有效報名.filter(function (r) { return r.status === "候補"; }).length;
    let 狀 = "正取";
    if (a.capacity && 正取 >= a.capacity) { if (候補 >= a.waitlist) return "名額與候補都已額滿"; 狀 = "候補"; }
    try {
      await 新增("registrations", { activity_id: a.id, member_id: 值.member, status: 狀, meal: 值.meal || "", note: 值.note || "" });
      提示("已代為報名（" + 狀 + "）");
      重新繪製();
    } catch (e) { return e.message; }
  });
}

// ===== 會費管理 =====
註冊頁面("會費管理", {
  圖示: "💰",
  可見: 是幹部,
  說明: "選年度後列出有效會員的常年會費繳納情形。勾選未繳的人按「登記繳費」，系統自動編收據號（民國年-流水號），會員登入後在「繳費紀錄」看得到。收據列印、收支記帳與決算報表請用會務管理系統（離線版）。",
  繪製: async function (容器, 參數) {
    const 年 = 參數.年 || new Date().getFullYear();
    const [名冊, 費] = await Promise.all([查詢("members", { status: "有效" }, "member_no.asc"), 查詢("fees", { year: 年 })]);
    const 列們 = 名冊.map(function (m) {
      const f = 費.find(function (x) { return x.member_id === m.id && x.item === "常年會費"; });
      return { id: m.id, member_no: m.member_no, name: m.name, agency: m.agency, email: m.email, 狀態: f ? "已繳" : "未繳", 繳費日: f ? f.paid_date : "", 金額: f ? f.amount : 0, 收據號: f ? f.receipt_no : "" };
    });
    const 已 = 列們.filter(function (r) { return r.狀態 === "已繳"; });
    const 年選 = h("select", { "aria-label": "年度", onchange: function () { 前往("會費管理", { 年: Number(年選.value) }); } },
      [年 + 1, 年, 年 - 1, 年 - 2].filter(function (y, i, a) { return a.indexOf(y) === i; }).sort().reverse().map(function (y) { return h("option", { value: y, selected: y === 年 }, 民國年(y) + " 年度"); }));
    容器.appendChild(頁首("會費管理", [h("label", null, "年度 ", 年選)]));
    容器.appendChild(h("p", { class: "次要字" }, 民國年(年) + " 年度常年會費：有效會員 " + 列們.length + " 人，已繳 " + 已.length + " 人（" + 金額(已.reduce(function (s, r) { return s + r.金額; }, 0)) + " 元），未繳 " + (列們.length - 已.length) + " 人"));
    容器.appendChild(資料表({
      匯出檔名: 民國年(年) + "年度常年會費",
      資料: function () { return 列們; },
      預設排序: { key: "member_no" },
      欄位: [
        { key: "member_no", 標題: "編號" }, { key: "name", 標題: "姓名" }, { key: "agency", 標題: "服務機關" },
        { key: "狀態", 標題: "繳費狀態", 顯示: function (r) { return h("span", { class: "標記 " + (r.狀態 === "已繳" ? "成" : "危") }, r.狀態); } },
        { key: "繳費日", 標題: "繳費日", 顯示: function (r) { return 民國(r.繳費日); } },
        { key: "金額", 標題: "金額", 數字: true, 顯示: function (r) { return r.金額 ? 金額(r.金額) : ""; } }, { key: "收據號", 標題: "收據號" }
      ],
      篩選: [{ 標題: "狀態", 選項: ["已繳", "未繳"], 取值: function (r) { return r.狀態; } }],
      批次: [
        { 文字: "登記繳費", 動作: function (列) {
          const 未 = 列.filter(function (r) { return r.狀態 === "未繳"; });
          if (!未.length) return 提示("勾選的人都已繳費", true);
          表單對話框("登記 " + 民國年(年) + " 年度常年會費（" + 未.length + " 人）", [
            { key: "amount", 標題: "每人金額", 類型: "金額", 必填: true, 最小: 1 },
            { key: "date", 標題: "繳費日期", 類型: "日期", 必填: true, 預設: 今天() },
            { key: "method", 標題: "繳費方式", 類型: "選單", 選項: ["現金", "轉帳", "薪資扣繳"], 必填: true, 預設: "現金" }
          ], {}, async function (值) {
            try {
              const n = await 呼叫("record_fees", { p_members: 未.map(function (r) { return r.id; }), p_year: 年, p_item: "常年會費", p_amount: Number(值.amount), p_date: 值.date, p_method: 值.method });
              提示("已登記 " + n + " 人");
              重新繪製();
            } catch (e) { return e.message; }
          });
        } },
        { 文字: "複製 Email 收件者（催繳用）", 動作: function (列) { 顯示信箱(列); } }
      ]
    }).元素);
  }
});
