// 檔案說明：幹部功能（會員管理〔含理監事、會員代表、匯入匯出〕、入會審核、活動管理〔葷素統計、簽到〕、會費管理）

// ===== 會員管理 =====
註冊頁面("會員管理", {
  圖示: "👥",
  分隔: true,
  可見: 是幹部,
  說明: "管理全體會員。點一列可編輯：理監事職稱只能選一個（理事、監事互斥），「會員代表」可另外勾選，兩者可並存；職稱與幹部角色的選項在「系統設定」增刪。幹部角色只有具管理權限的幹部（預設是理事長、秘書長、總幹事）能指派；已連結帳號的會員，帳號要是由他們建立或核准連結的才能指派，否則請先解除帳號連結、再替他建立登入帳號。「匯入名冊」支援 Excel／CSV／ODS，標準欄位為 姓名、女0男1、服務機關、服務單位、職稱、電子郵件信箱（可再加 公務電話、員工編號、理監事、會員代表）；Email 相同、員工編號與姓名都相同，或姓名＋服務機關相同（名冊上只有一位且 Email、員工編號沒有矛盾）的視為同一人並更新資料，其他新增；無法判斷的列會列出並略過，更新時空白的儲存格不會清掉原有資料。登入帳號：具管理權限的幹部點會員後按「建立登入帳號」，填 Email 與初始密碼即可直接登入（不用收驗證信，適合收不到外部信的公務信箱或測試帳號）；會員也可以自己註冊後送「連結申請」，到「申請審核」核准。「帳號」欄可篩出還沒有帳號的人。",
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
        { key: "帳號", 標題: "帳號", 值: function (r) { return r.user_id ? "已有帳號" : "沒有帳號"; } }
      ],
      篩選: [
        { 標題: "機關", 選項: 機關們, 取值: function (r) { return r.agency; } },
        { 標題: "理監事", 選項: ["理事", "監事", "非理監事"], 取值: function (r) { return r.board_role || "非理監事"; } },
        { 標題: "會員代表", 選項: ["會員代表", "非會員代表"], 取值: function (r) { return r.is_representative ? "會員代表" : "非會員代表"; } },
        { 標題: "會籍", 選項: ["有效", "停權", "退會"], 取值: function (r) { return r.status; } },
        { 標題: "帳號", 選項: ["已有帳號", "沒有帳號"], 取值: function (r) { return r.user_id ? "已有帳號" : "沒有帳號"; } }
      ],
      點列: function (r) { 編輯線上會員(r, 機關們(), 重載); },
      批次: [
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

// 新增或編輯一位會員（理監事職稱單選，會員代表另外勾選）；管理者另外看得到這位會員連結的登入帳號，指派幹部前可以核對
let 編輯開啟中 = false;
async function 編輯線上會員(原, 機關們, 完成後) {
  // 讀登入帳號期間又點一次（例如連點兩下）：不重複開視窗
  if (編輯開啟中) return;
  let 登入帳號 = "";
  if (原 && 原.user_id && 是管理者()) {
    const 場 = 連線.場次;
    編輯開啟中 = true;
    try { 登入帳號 = await 呼叫("member_login_email", { p_member: 原.id }) || ""; }
    catch (e) { if (連線.場次 === 場) 登入帳號 = "（無法讀取：" + e.message + "）"; }
    finally { 編輯開啟中 = false; }
    // 讀取期間登出或換人登入：不開視窗（避免個資出現在登入畫面或下一位的畫面）
    if (連線.場次 !== 場 || !連線.帳號) return;
    登入帳號 += 原.linked_by_admin ? "（已經具管理權限的幹部建立或核對）" : "（還沒經具管理權限的幹部核對：向本人確認後勾選下面的「已向本人核對」，才能指派幹部）";
  }
  const 欄位們 = [
    { key: "name", 標題: "姓名", 必填: true }, { key: "gender", 標題: "性別", 類型: "選單", 選項: ["女", "男"] },
    { key: "employee_no", 標題: "員工編號" }, { key: "agency", 標題: "服務機關", 類型: "選單", 選項: 機關們, 必填: true },
    { key: "unit", 標題: "服務單位" }, { key: "title", 標題: "職稱" },
    { key: "email", 標題: "Email（名冊上的公務信箱）", 類型: "Email" }, { key: "phone", 標題: "公務電話" },
    { key: "join_date", 標題: "入會日期", 類型: "日期" }, { key: "status", 標題: "會籍", 類型: "選單", 選項: ["有效", "停權", "退會"], 必填: true },
    { key: "理監事", 標題: "理監事職稱（理事、監事只能擇一）", 類型: "選單", 選項: 理監事選項(), 不加空白: true },
    { key: "is_representative", 標題: "會員代表", 類型: "勾選", 勾選文字: "是會員代表（可同時為理事或監事）" },
    { key: "staff_role", 標題: "幹部角色（可使用管理功能）", 類型: "選單", 選項: 幹部角色選項(), 唯讀: !是管理者(), 說明: 是管理者() ? "" : "只有具管理權限的幹部可以指派" },
    { key: "note", 標題: "備註", 類型: "多行", 行數: 2 }
  ];
  if (登入帳號) 欄位們.push({ key: "登入帳號", 標題: "登入帳號（只有具管理權限的幹部看得到）", 唯讀: true, 寬: true });
  // 身分資料或帳號連結還沒經管理者核對（會計、承辦人新增／修改過，或由他們核准連結）：管理者可以勾選核對
  const 要核對 = 原 && 是管理者() && (原.identity_by_staff || (原.user_id && !原.linked_by_admin));
  if (要核對) 欄位們.push({ key: "核對", 標題: "身分核對", 類型: "勾選", 寬: true,
    勾選文字: "已向本人核對姓名、Email、員工編號" + (原.user_id ? "與上面的登入帳號" : "") + "（核對後才能指派幹部）",
    說明: 原.identity_by_staff ? "這筆的姓名、Email 或員工編號是會計或承辦人新增或修改的" : "這個登入帳號是會計或承辦人核准連結的" });
  const 初值 = 原 ? Object.assign({}, 原, { 登入帳號: 登入帳號, 理監事: 原.board_role ? 原.board_role + "|" + (原.board_title || 原.board_role) : "" }) : { status: "有效", join_date: 今天(), 理監事: "" };
  const 選項 = {};
  if (原 && 是管理者()) {
    選項.額外按鈕 = [];
    if (!原.user_id) 選項.額外按鈕.push({ 文字: "建立登入帳號", 動作: function (關) { 關(null); 建立登入帳號(原, 完成後); } });
    if (原.user_id) 選項.額外按鈕.push({ 文字: "重設密碼", 動作: function (關) { 關(null); 重設會員密碼(原); } });
    if (原.user_id) 選項.額外按鈕.push({ 文字: "解除帳號連結", 動作: async function (關) {
      if (!(await 確認("解除「" + 原.name + "」的帳號連結？之後要再替他建立登入帳號，或由他送連結申請。", "解除連結"))) return false;
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
      // 先核對（才能在同一次儲存裡指派幹部），再存資料
      if (要核對 && 值.核對) await 呼叫("confirm_member_identity", { p_member: 原.id });
      if (原) await 修改("members", { id: 原.id }, 資料); else await 新增("members", 資料);
      提示("已儲存");
      if (原 && 原.user_id === 連線.帳號.id) {
        // 改到自己的資料（例如自己的幹部角色）：更新表頭與選單；這一頁不能再看時回到我的資料
        await 重新讀取我的資料();
        更新外框();
        const 頁 = 頁面表[狀態.目前頁];
        if (頁 && 頁.可見 && !頁.可見()) { 前往("我的資料"); return; }
      }
      完成後();
    } catch (e) { return e.message; }
  }, 選項);
}

// 檢查兩次輸入的密碼；有問題回傳錯誤訊息
function 檢查密碼(值) {
  if (String(值.密碼 || "").length < 8) return "密碼至少 8 個字元";
  if (值.密碼 !== 值.再次) return "兩次輸入的密碼不一樣";
  return "";
}

// 管理者替會員建立登入帳號（不用收驗證信，馬上可以登入）；Email 已註冊過時直接完成驗證並改成這組密碼
function 建立登入帳號(原, 完成後) {
  表單對話框("建立登入帳號：" + 原.name, [
    { key: "email", 標題: "登入 Email", 類型: "Email", 必填: true, 說明: "請填本人親自提供的 Email（不要直接照抄名冊）；公務信箱或測試帳號都可以，收不到信也沒關係（不寄驗證信）" },
    { key: "密碼", 標題: "初始密碼（至少 8 個字元）", 類型: "密碼", 必填: true },
    { key: "再次", 標題: "再輸入一次", 類型: "密碼", 必填: true }
  ], {}, async function (值) {
    const 錯 = 檢查密碼(值);
    if (錯) return 錯;
    try {
      const 結果 = await 呼叫("create_member_login", { p_member: 原.id, p_login_email: 值.email, p_password: 值.密碼 });
      提示((結果 === "已存在" ? "這個 Email 原本已註冊（未驗證）：已完成驗證、改成新密碼並連結到「" + 原.name + "」" : "已建立登入帳號 " + String(值.email).trim().toLowerCase() + "，可以直接登入") +
        (原.identity_by_staff ? "。這筆資料曾由會計或承辦人修改，要指派幹部前請先在會員資料勾選「已向本人核對」" : ""));
      完成後();
    } catch (e) { return e.message; }
  }, { 儲存文字: "建立帳號", 前言: "建立後請把 Email 與密碼交給本人，登入後可在「我的資料 → 修改密碼」自己改。\n這個 Email 如果有人註冊過但還沒完成驗證（例如收不到驗證信），會直接完成驗證、改成這組密碼並連結；已經驗證過的帳號不能這樣接管，請本人登入後送連結申請。" });
}

// 管理者替會員重設登入密碼（收不到重設密碼信的人用）
function 重設會員密碼(原) {
  表單對話框("重設密碼：" + 原.name, [
    { key: "密碼", 標題: "新密碼（至少 8 個字元）", 類型: "密碼", 必填: true },
    { key: "再次", 標題: "再輸入一次", 類型: "密碼", 必填: true }
  ], {}, async function (值) {
    const 錯 = 檢查密碼(值);
    if (錯) return 錯;
    try { await 呼叫("set_member_password", { p_member: 原.id, p_password: 值.密碼 }); 提示("已重設「" + 原.name + "」的密碼，請把新密碼交給本人"); }
    catch (e) { return e.message; }
  }, { 儲存文字: "重設密碼" });
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

// 把名冊裡的理監事寫法轉成 [身分, 職稱]（依「系統設定」的職稱清單）：理事長→[理事,理事長]、監事→[監事,監事]；空白回傳 ["",""]；看不懂回傳 null
function 轉理監事(v) {
  const s = String(v || "").trim();
  if (!s || s === "無") return ["", ""];
  const 職 = (線上.設定已讀 ? 線上.職稱們 : 預設職稱們).find(function (t) { return t.title === s; });
  return 職 ? [職.board_role, 職.title] : null;
}

// 兩個值是否不衝突：任一邊空白，或兩邊相同（不分大小寫）
function 不衝突(a, b) { return !a || !b || String(a).toLowerCase() === String(b).toLowerCase(); }

// 兩筆資料的 Email、員工編號都沒有矛盾（才可能是同一人）
function 相容(甲, 乙) { return 不衝突(甲.email, 乙.email) && 不衝突(甲.employee_no, 乙.employee_no); }

// 匯入名冊：讀檔、對應欄位、比對是否為名冊上的同一人（相同就更新，沒有就新增）
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
  // 重新讀一次名冊，比對最新的資料（畫面上的可能已被其他幹部修改）
  try { 名冊 = await 查詢("members", null, "member_no.asc"); } catch (e) { return 提示("讀取名冊失敗：" + e.message, true); }
  // 沒有服務機關欄時，不用「姓名」判斷同一人（不同機關的同名同姓太多）
  const 用姓名 = 對應.agency != null;
  const 名鍵 = function (d) { return String(d.name || "").trim() + "｜" + String(d.agency || "").trim(); };
  const 編鍵 = function (v) { return String(v || "").trim().toLowerCase(); };
  const 同名 = function (m, d) { return String(m.name || "").trim() === d.name; };
  const 放 = function (表, k, v) { (表[k] = 表[k] || []).push(v); };
  const 不重複 = function (陣列) { return Array.from(new Set(陣列)); };
  // 名冊上既有的人：依 Email、員工編號（不分大小寫）、姓名＋服務機關建索引
  const 依信箱 = {}, 依員編 = {}, 依姓名機關 = {};
  名冊.forEach(function (m) {
    if (m.email) 依信箱[m.email.toLowerCase()] = m;
    if (m.employee_no) 放(依員編, 編鍵(m.employee_no), m);
    放(依姓名機關, 名鍵(m), m);
  });
  const 問題們 = [];
  const 問題 = function (列號, 文字) { 問題們.push({ 列號: 列號, 文字: 文字 }); };
  // 先把每一列讀成資料
  const 各列 = [];
  列.slice(1).forEach(function (r, i) {
    const 列號 = i + 2;
    const 取 = function (k) { return 對應[k] == null ? "" : String(r[對應[k]] == null ? "" : r[對應[k]]).trim(); };
    const 資料 = { name: 取("name") };
    if (!資料.name) return;
    const 列名 = "第 " + 列號 + " 列「" + 資料.name + "」";
    if (對應.gender != null) { const g = 取("gender"); 資料.gender = g === "0" || g === "女" ? "女" : g === "1" || g === "男" ? "男" : ""; }
    ["agency", "unit", "title", "phone", "employee_no"].forEach(function (k) { if (對應[k] != null) 資料[k] = 取(k); });
    if (對應.email != null) 資料.email = 取("email").toLowerCase();
    if (對應.理監事 != null) {
      const 理 = 轉理監事(取("理監事"));
      if (!理) 問題(列號, 列名 + "理監事欄看不懂（" + 取("理監事") + "）：新增者設為「無」，既有會員保留原值");
      else { 資料.board_role = 理[0]; 資料.board_title = 理[1]; }
    }
    if (對應.會員代表 != null) 資料.is_representative = /^(1|是|y|yes|v|✔|ｖ)$/i.test(取("會員代表"));
    各列.push({ 列號: 列號, 列名: 列名, 資料: 資料 });
  });

  // 一位「人」＝檔案裡同一人的各列 {列們, 原（對應的名冊會員）, 略過, 併入}
  // 同一人的各列合併成一筆資料：依列的順序，後面有填的欄位覆蓋前面的
  const 資料of = function (人) {
    const d = {};
    人.列們.slice().sort(function (a, b) { return a.列號 - b.列號; }).forEach(function (x) {
      Object.keys(x.資料).forEach(function (k) { if (x.資料[k] !== "" || !(k in d)) d[k] = x.資料[k]; });
    });
    return d;
  };
  const 列號們 = function (人) { return 人.列們.map(function (x) { return x.列號; }).sort(function (a, b) { return a - b; }).join("、"); };
  const 首列 = function (人) { return Math.min.apply(null, 人.列們.map(function (x) { return x.列號; })); };
  const 略過 = function (人, 文字) { 人.略過 = true; 問題(首列(人), "第 " + 列號們(人) + " 列「" + 人.列們[0].資料.name + "」" + 文字 + "，已略過"); };
  const 有效 = function (人) { return !人.略過 && !人.併入; };
  // 一人在檔案裡出現過的各個「姓名＋服務機關」（機關空白的列不算；全部空白時用合併後的）。調職前後的列都算
  const 名鍵們 = function (人) {
    const 們 = 不重複(人.列們.filter(function (x) { return x.資料.agency; }).map(function (x) { return 名鍵(x.資料); }));
    return 們.length ? 們 : [名鍵(資料of(人))];
  };
  // 兩人可不可以視為同一人：姓名相同，Email、員工編號也沒有矛盾
  const 可合 = function (甲, 乙) { const a = 資料of(甲), b = 資料of(乙); return a.name === b.name && 相容(a, b); };
  // 把乙併到甲（同一人）；姓名、Email 或員工編號有矛盾就略過乙
  const 合入 = function (甲, 乙, 對象名) {
    if (!可合(甲, 乙)) return 略過(乙, "與第 " + 列號們(甲) + " 列都對應到名冊上的「" + 對象名 + "」，但姓名、Email 或員工編號不同，無法判斷");
    甲.列們 = 甲.列們.concat(乙.列們);
    乙.併入 = 甲;
  };

  // 一、檔案裡 Email 相同、或員工編號＋姓名相同的列，歸成同一人（與列的順序無關）
  const 有識別 = 各列.filter(function (x) { return x.資料.email || x.資料.employee_no; });
  const 父 = 有識別.map(function (_, i) { return i; });
  const 根 = function (i) { while (父[i] !== i) i = 父[i] = 父[父[i]]; return i; };
  const 首見 = {};
  有識別.forEach(function (x, i) {
    const 鍵們 = [];
    if (x.資料.email) 鍵們.push("信:" + x.資料.email);
    if (x.資料.employee_no) 鍵們.push("編:" + 編鍵(x.資料.employee_no) + "｜" + x.資料.name);
    鍵們.forEach(function (k) {
      if (!(k in 首見)) { 首見[k] = i; return; }
      const a = 根(首見[k]), b = 根(i);
      if (a !== b) 父[Math.max(a, b)] = Math.min(a, b);
    });
  });
  const 人們 = [], 依根 = {};
  有識別.forEach(function (x, i) { const r = 根(i); if (!依根[r]) 人們.push(依根[r] = { 列們: [] }); 依根[r].列們.push(x); });
  人們.forEach(function (人) {
    const 信們 = 不重複(人.列們.map(function (x) { return x.資料.email; }).filter(Boolean));
    const 編們 = 不重複(人.列們.map(function (x) { return 編鍵(x.資料.employee_no); }).filter(Boolean));
    const 名們 = 不重複(人.列們.map(function (x) { return x.資料.name; }));
    if (信們.length > 1 || 編們.length > 1 || 名們.length > 1) 略過(人, "的 Email 或員工編號相同，姓名、Email 或員工編號卻不一致，無法判斷是不是同一人");
  });

  // 二、用 Email、員工編號＋姓名找名冊上的同一人
  const 強 = {};   // 名冊 id → 對應到的人（以 Email 對應的排第一）
  人們.forEach(function (人) {
    if (人.略過) return;
    const d = 資料of(人);
    const 信原 = d.email ? 依信箱[d.email] || null : null;
    let 編原 = null;
    if (d.employee_no) {
      const 們 = (依員編[編鍵(d.employee_no)] || []).filter(function (m) { return 同名(m, d); });
      // 各機關各自編號，可能有同名又同號的人：Email 已唯一對到其中一位就用那一位
      if (們.length > 1 && 們.indexOf(信原) < 0) return 略過(人, "名冊上有 " + 們.length + " 位同名且員工編號相同的會員，無法判斷是誰");
      編原 = 們.length > 1 ? 信原 : 們[0] || null;
    }
    if (信原) {
      // Email 相同就是同一人；但姓名、員工編號明顯指向名冊上另一位時（多半是 Email 填錯），略過
      const 員編不合 = !不衝突(d.employee_no, 信原.employee_no);
      const 另有其人 = 名冊.some(function (m) {
        return m !== 信原 && 同名(m, d) && (d.employee_no && m.employee_no ? 不衝突(m.employee_no, d.employee_no) : 用姓名 && 名鍵們(人).indexOf(名鍵(m)) >= 0);
      });
      if ((!同名(信原, d) && (員編不合 || 另有其人)) || (員編不合 && 另有其人)) return 略過(人, "的 Email 屬於名冊上的「" + 信原.name + "」，姓名或員工編號卻指向另一位會員（請檢查 Email）");
    }
    if (信原 && 編原 && 信原 !== 編原) return 略過(人, "的 Email 是名冊上「" + 信原.name + "」的，員工編號卻是另一位會員的，無法判斷");
    const m = 信原 || 編原;
    if (!m) return;
    人.原 = m;
    if (信原) (強[m.id] = 強[m.id] || []).unshift(人); else 放(強, m.id, 人);
  });
  // 同一位會員被兩人對應（一個用 Email、一個用員工編號）：沒有矛盾就合併，有矛盾就略過員工編號那一位
  Object.keys(強).forEach(function (id) { 強[id].slice(1).forEach(function (人) { 合入(強[id][0], 人, 強[id][0].原.name); }); });

  // 三、其餘有 Email 或員工編號的人：用姓名＋服務機關找名冊（只有一位、沒有矛盾才算；這人在檔案裡出現過的各個機關都比對）
  const 弱 = {}, 附 = {};
  if (用姓名) 人們.forEach(function (人) {
    if (!有效(人) || 人.原) return;
    const d = 資料of(人);
    const 候 = 不重複([].concat.apply([], 名鍵們(人).map(function (k) { return 依姓名機關[k] || []; }))).filter(function (m) { return 相容(d, m); });
    let m = 候[0] || null;
    if (候.length > 1) {
      // 名冊上有多位同名同機關：排除已被別人用 Email 或員工編號認定的，只剩一位才算
      const 未用 = 候.filter(function (x) { return !強[x.id]; });
      if (未用.length !== 1) return 略過(人, "名冊上有 " + 候.length + " 位同名且機關相符的會員，無法判斷是誰（請補上 Email 或員工編號）");
      m = 未用[0];
    }
    if (!m) return;
    // 先收集起來，最後整組判斷（與列的順序無關）
    放(強[m.id] ? 附 : 弱, m.id, 人);
  });
  // 兩兩都可視為同一人
  const 全可合 = function (組) { return 組.every(function (甲, i) { return 組.slice(i + 1).every(function (乙) { return 可合(甲, 乙); }); }); };
  // 對應到已用 Email／員工編號認定的會員：連同那一位整組比對，全部沒有矛盾才合併，否則這幾位都略過
  Object.keys(附).forEach(function (id) {
    const 主 = 強[id][0], 們 = 附[id];
    if (!全可合([主].concat(們))) return 們.forEach(function (人) { 略過(人, "與第 " + 列號們(主) + " 列都對應到名冊上的「" + 主.原.name + "」，但姓名、Email 或員工編號不同，無法判斷"); });
    們.forEach(function (人) { 主.列們 = 主.列們.concat(人.列們); 人.併入 = 主; });
  });
  Object.keys(弱).forEach(function (id) {
    const 們 = 弱[id];
    if (!全可合(們)) return 們.forEach(function (人) { 略過(人, "與檔案裡其他列都對應到名冊上的「" + 們[0].列們[0].資料.name + "」，但 Email 或員工編號不同，無法判斷"); });
    們[0].原 = 名冊.find(function (m) { return m.id === id; });
    們.slice(1).forEach(function (人) { 們[0].列們 = 們[0].列們.concat(人.列們); 人.併入 = 們[0]; });
  });
  const 認 = {};   // 名冊 id → 已對應的人
  人們.forEach(function (人) { if (有效(人) && 人.原) 認[人.原.id] = 人; });

  // 四、沒有 Email、也沒有員工編號的列：依姓名＋服務機關歸到名冊上的人或檔案裡的人
  const 無識別 = 各列.filter(function (x) { return !x.資料.email && !x.資料.employee_no; });
  if (!用姓名) 無識別.forEach(function (x) { 人們.push({ 列們: [x] }); });
  else {
    const 依鍵 = {};
    無識別.forEach(function (x) { 放(依鍵, 名鍵(x.資料), x); });
    // 先記下有 Email 或員工編號的人此刻的各個「姓名＋機關」，後面附加的列不影響比對（與列的順序無關）
    const 識別鍵 = new Map();
    人們.forEach(function (人) { if (有效(人)) 識別鍵.set(人, 名鍵們(人)); });
    Object.keys(依鍵).forEach(function (k) {
      const 們 = 依鍵[k];
      const 名冊同 = 依姓名機關[k] || [];
      if (名冊同.length > 1) {
        const 未用 = 名冊同.filter(function (m) { return !認[m.id]; });
        if (未用.length !== 1) return 們.forEach(function (x) { 問題(x.列號, x.列名 + "名冊上有 " + 名冊同.length + " 位同名同機關的會員，無法判斷是誰，已略過（請補上 Email 或員工編號）"); });
        const 人 = { 列們: 們, 原: 未用[0] };
        人們.push(人); 認[未用[0].id] = 人;
      } else if (名冊同.length === 1) {
        const m = 名冊同[0];
        if (認[m.id] && 資料of(認[m.id]).name !== 們[0].資料.name) return 們.forEach(function (x) { 問題(x.列號, x.列名 + "與第 " + 列號們(認[m.id]) + " 列都對應到名冊上的「" + m.name + "」，但姓名不同，無法判斷，已略過"); });
        if (認[m.id]) 認[m.id].列們 = 認[m.id].列們.concat(們);
        else { const 人 = { 列們: 們, 原: m }; 人們.push(人); 認[m.id] = 人; }
      } else {
        // 名冊上沒有：檔案裡有同名同機關、有 Email 或員工編號的人就是他（只有一位才算）
        const 同 = 人們.filter(function (人) { return 有效(人) && 識別鍵.has(人) && 識別鍵.get(人).indexOf(k) >= 0; });
        if (同.length > 1) return 們.forEach(function (x) { 問題(x.列號, x.列名 + "與檔案裡第 " + 同.map(列號們).join("、") + " 列可能是同一人，無法判斷是哪一位，已略過（請補上 Email 或員工編號）"); });
        if (同.length === 1) 同[0].列們 = 同[0].列們.concat(們);
        else 人們.push({ 列們: 們 });
      }
    });
  }

  // 五、整理成要新增、要更新的資料
  const 項們 = 人們.filter(有效).map(function (人) {
    if (人.列們.length > 1) 問題(首列(人), "第 " + 列號們(人) + " 列「" + 資料of(人).name + "」是同一人，已合併");
    const d = 資料of(人);
    return { 列號: 首列(人), 原: 人.原 || null, 資料: 人.原 ? d : Object.assign({ status: "有效", join_date: 今天() }, 對應.理監事 != null ? { board_role: "", board_title: "" } : {}, d) };
  }).sort(function (a, b) { return a.列號 - b.列號; });
  // 沒有服務機關欄時，沒有 Email、員工編號的新會員無法與名冊比對（再匯入一次會重複新增）
  const 無法比對 = 用姓名 ? 0 : 項們.filter(function (項) { return !項.原 && !項.資料.email && !項.資料.employee_no; }).length;
  const 問題文字 = 問題們.sort(function (a, b) { return a.列號 - b.列號; }).map(function (p) { return p.文字; });
  const 新增們 = 項們.filter(function (x) { return !x.原; }).map(function (x) { return x.資料; });
  // 更新既有會員時，空白的儲存格不覆蓋原有資料（理監事欄空白＝「無」，照樣寫入）
  const 更新們 = 項們.filter(function (x) { return x.原; }).map(function (x) {
    const 資料 = {};
    Object.keys(x.資料).forEach(function (k) { if (x.資料[k] !== "" || k === "board_role" || k === "board_title") 資料[k] = x.資料[k]; });
    return { id: x.原.id, 資料: 資料 };
  });
  const 好 = await 對話框("匯入名冊：" + f.name, [
    h("p", null, "新增 " + 新增們.length + " 人、更新 " + 更新們.length + " 人。"),
    h("p", { class: "次要字 小字" }, "判斷同一人的方式：Email 相同；或員工編號、姓名都相同；或姓名＋服務機關相同且名冊上只有一位、Email 與員工編號沒有矛盾。更新時空白的儲存格不會清掉原有資料。"),
    h("p", { class: "次要字 小字" }, "對應到的欄位：" + Object.keys(對應).map(function (k) { return 列[0][對應[k]]; }).join("、")),
    無法比對 ? h("p", { class: "提醒" }, "有 " + 無法比對 + " 位新會員沒有 Email、員工編號，檔案也沒有「服務機關」欄，無法與名冊比對，會直接新增；同一個檔案再匯入一次會重複新增。") : null,
    問題文字.length ? h("ul", { class: "錯誤" }, 問題文字.slice(0, 15).map(function (p) { return h("li", null, p); }), 問題文字.length > 15 ? h("li", null, "…等共 " + 問題文字.length + " 項") : null) : null
  ], [{ 文字: "取消" }, { 文字: "開始匯入", 主: true, 值: true }]);
  if (!好) return;
  const 場 = 連線.場次;
  const 失敗 = [];
  let 已新增 = 0, 已更新 = 0, 中斷 = null;
  for (let i = 0; i < 新增們.length && !中斷; i += 200) {
    const 批 = 新增們.slice(i, i + 200);
    try { await 新增("members", 批); 已新增 += 批.length; }
    catch (e) {
      // 網路中斷或伺服器忙碌：不知道這批有沒有寫入，停下來，不要逐筆重送（會重複新增）
      if (暫時錯誤(e)) { 中斷 = e; break; }
      // 伺服器明確拒絕整批（整批都沒有寫入）：改成一筆一筆新增，找出是哪幾筆有問題
      for (const 筆 of 批) {
        try { await 新增("members", [筆]); 已新增++; }
        catch (e2) { if (暫時錯誤(e2)) { 中斷 = e2; break; } 失敗.push(筆.name + "：" + e2.message); }
      }
    }
  }
  for (const u of 更新們) {
    if (中斷) break;
    try { await 修改("members", { id: u.id }, u.資料); 已更新++; }
    catch (e) { if (暫時錯誤(e)) { 中斷 = e; break; } 失敗.push(u.資料.name + "：" + e.message); }
  }
  // 匯入期間換人登入：不在下一位的畫面上顯示結果（後面的資料已因登入狀態變更而停止送出）
  if (連線.場次 !== 場 && 連線.帳號) return;
  // 登入逾時或登出（沒有人登入）：仍顯示中斷說明（只有筆數，沒有個資），提醒重新登入後怎麼處理
  if (!連線.帳號 && !中斷) return;
  if (中斷) {
    對話框("匯入中斷", [
      h("p", { class: "錯誤" }, "已新增 " + 已新增 + " 人、更新 " + 已更新 + " 人後中斷：" + 中斷.message),
      h("p", null, "最後送出的那一批可能已寫入，也可能沒有。請" + (中斷.需重新登入 ? "重新登入" : "等網路恢復") + "後重新整理名冊，再匯入同一個檔案一次：已在名冊上的人會比對為同一人並更新，不會重複新增。"),
      無法比對 ? h("p", { class: "提醒" }, "但沒有 Email、員工編號的新會員（這個檔案沒有「服務機關」欄）無法比對，再匯入前請先在名冊上找出已新增的人，從檔案刪掉，以免重複。") : null]);
  } else if (失敗.length) {
    對話框("匯入完成（有 " + 失敗.length + " 筆沒有成功）", [
      h("p", null, "新增 " + 已新增 + " 人、更新 " + 已更新 + " 人。下列資料沒有匯入，請修正後再匯入一次："),
      h("ul", { class: "錯誤" }, 失敗.slice(0, 30).map(function (x) { return h("li", null, x); }))]);
  } else 提示("匯入完成：新增 " + 已新增 + "、更新 " + 已更新);
  if (連線.帳號) 完成後();
}

// ===== 申請審核（入會申請、帳號連結申請）=====
註冊頁面("申請審核", {
  圖示: "✅",
  可見: 是幹部,
  說明: "「帳號連結」：已在名冊上的會員用個人 Email 註冊後送出的連結申請，請核對姓名、機關、公務信箱後，選擇名冊上對應的會員並核准。「入會申請」：還不是會員的同仁送出的申請，核准後一律建立一筆新的會員資料並連結帳號；名冊上已有相同公務信箱的會員時不能核准，請退回，並請申請人改送「連結申請」，再到「帳號連結」核對後連結（或由具管理權限的幹部在「會員管理」替那位會員建立登入帳號）。退回時填寫原因，申請人登入後看得到。",
  繪製: async function (容器, 參數) {
    const [申們, 連們, 名冊] = await Promise.all([查詢("applications", null, "created_at.desc"), 查詢("link_requests", null, "created_at.desc"), 查詢("members", null, "member_no.asc")]);
    const 待連 = 連們.filter(function (a) { return a.status === "待審"; }).length;
    const 待入 = 申們.filter(function (a) { return a.status === "待審"; }).length;
    容器.appendChild(頁首("申請審核"));
    const 頁籤 = 建立頁籤(["帳號連結（待審 " + 待連 + "）", "入會申請（待審 " + 待入 + "）"], 參數.頁籤, function (名, 區) {
      if (名.indexOf("帳號連結") === 0) 繪製連結審核(區, 連們, 名冊);
      else 繪製入會審核(區, 申們, 名冊);
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
  const 說明 = function (m) { return m.member_no + " " + m.name + "（" + (m.agency || "") + " " + (m.unit || "") + "，" + (m.email || "無信箱") + "）" + (m.staff_role ? "【幹部：" + m.staff_role + "】" : ""); };
  表單對話框("核准帳號連結：" + r.name, [
    { key: "member", 標題: "對應到名冊上的會員（只列出尚未連結帳號的人）", 類型: "選單", 必填: true, 寬: true,
      說明: 建議 ? "已預選姓名或公務信箱相符的會員，請再確認一次" : "名冊上找不到明顯相符的人，請仔細核對後再選",
      選項: 可選.map(function (m) { return { 值: m.id, 字: 說明(m) }; }) }
  ], { member: 建議 ? 建議.id : "" }, async function (值) {
    const m = 可選.find(function (x) { return x.id === 值.member; });
    const 好 = await 確認("申請人「" + r.name + "」（" + (r.agency || "") + "，公務信箱 " + (r.office_email || "未填") + "，登入 Email " + r.login_email + "）\n將連結到名冊上的：" + (m ? 說明(m) : "") + "\n確定是同一人嗎？", "確定連結");
    if (!好) return "已取消，請重新選擇";
    try { await 呼叫("approve_link_request", { p_request: r.id, p_member: 值.member }); 提示("已連結：" + r.name); 重新繪製(); } catch (e) { return e.message; }
  }, { 儲存文字: "核准連結" });
}

// 退回申請（入會或連結），需填原因
function 退回申請(函式, r, 預設原因) {
  表單對話框("退回申請：" + r.name, [{ key: "原因", 標題: "退回原因（申請人看得到）", 類型: "多行", 行數: 3, 必填: true }], { 原因: 預設原因 || "" }, async function (值) {
    const 參 = 函式 === "reject_application" ? { p_application: r.id, p_reason: 值.原因 } : { p_request: r.id, p_reason: 值.原因 };
    try { await 呼叫(函式, 參); 提示("已退回"); 重新繪製(); } catch (err) { return err.message; }
  });
}

// 「入會申請」頁籤
function 繪製入會審核(區, 申們, 名冊) {
  const 名冊信箱 = {};
  (名冊 || []).forEach(function (m) { if (m.email) 名冊信箱[m.email.toLowerCase()] = m; });
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
        const 撞名冊 = r.email && 名冊信箱[r.email.toLowerCase()];
        if (撞名冊) {
          return [h("span", { class: "標記 警", title: "名冊已有這個公務信箱：" + 撞名冊.member_no + " " + 撞名冊.name }, "名冊已有此信箱（" + 撞名冊.name + "）"), " ",
            h("button", { class: "鈕 小 危", type: "button", onclick: function (e) { e.stopPropagation(); 退回申請("reject_application", r, "名冊上已有您的資料，請改到「連結會員資料」送出連結申請（或請協會直接替您建立登入帳號）"); } }, "退回")];
        }
        return [h("button", { class: "鈕 小 主", type: "button", onclick: async function (e) {
          e.stopPropagation();
          if (!(await 確認("核准「" + r.name + "」入會？（會建立一筆新的會員資料）", "核准"))) return;
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
  // 正取或候補由資料庫依「當下」的名額決定（鎖住活動後重新計數），不用畫面上可能已過時的人數
  表單對話框("代會員報名：" + a.name, 欄位們, {}, async function (值) {
    try {
      const 狀 = await 呼叫("staff_register", { p_activity: a.id, p_member: 值.member, p_meal: 值.meal || "", p_note: 值.note || "" });
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
