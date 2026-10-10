// 檔案說明：一般會員功能（我的資料、活動報名〔含葷素〕、繳費紀錄、線上入會申請）

// 服務機關預設清單（依《財政部組織法》第 5 條所列次級機關；名冊裡出現的其他機關也會加入）
const 預設服務機關 = ["財政部（部本部）", "財政部國庫署", "財政部賦稅署", "財政部關務署", "財政部國有財產署", "財政部財政資訊中心",
  "財政部臺北國稅局", "財政部高雄國稅局", "財政部北區國稅局", "財政部中區國稅局", "財政部南區國稅局", "財政部財政人員訓練所"];

// 理監事職稱選項（依「系統設定」的清單）：選了就決定是理事或監事（兩者互斥）
function 理監事選項() {
  const 清單 = 線上.設定已讀 ? 線上.職稱們 : 預設職稱們;
  return [{ 值: "", 字: "無" }].concat(清單.map(function (t) {
    return { 值: t.board_role + "|" + t.title, 字: t.title === t.board_role ? t.title : t.title + "（" + t.board_role + "）" };
  }));
}

// 幹部角色選項（依「系統設定」的清單）
function 幹部角色選項() {
  return (線上.設定已讀 ? 線上.角色們 : 預設角色們).map(function (r) { return r.name; });
}

// 會員的職務文字（例：常務理事、會員代表、秘書長）
function 職務文字(m) {
  return [m.board_title, m.is_representative ? "會員代表" : "", m.staff_role].filter(Boolean).join("、");
}

// 職務小標籤
function 職務標籤(m) {
  const 標 = [];
  if (m.board_title) 標.push(h("span", { class: "標記 金" }, m.board_title));
  if (m.is_representative) 標.push(h("span", { class: "標記 成" }, "會員代表"));
  if (m.staff_role) 標.push(h("span", { class: "標記" }, "幹部：" + m.staff_role));
  return 標.length ? 標 : h("span", { class: "次要字" }, "一般會員");
}

註冊頁面("我的資料", {
  圖示: "👤",
  可見: function () { return !!線上.會員; },
  說明: "這裡是您在協會名冊上的資料。服務機關、單位、職稱、電話、性別可以自己修改；理監事、會員代表、會籍等由協會幹部維護，有誤請洽協會。要退出協會，在下方「退會」送出退會申請，由協會審核；審核前可以撤回。",
  繪製: async function (容器) {
    // 每次打開都重新讀取：編號重編、會籍改為退會、會員資料被刪除之後，畫面才會是最新的
    await 重新讀取我的資料();
    更新外框();
    if (!線上.會員) { 提示("您已不在協會名冊上（退會申請可能已經核准），如有疑問請洽協會"); 前往("連結會員資料"); return; }
    const m = 線上.會員;
    const 列 = function (名, 值) { return h("div", { class: "欄" }, h("span", null, 名), h("div", null, 值 || "—")); };
    容器.appendChild(頁首("我的資料", [
      h("button", { class: "鈕 主", type: "button", id: "修改我的資料鈕", onclick: 修改我的資料 }, "修改我的資料"),
      h("button", { class: "鈕", type: "button", onclick: 修改我的密碼 }, "修改密碼")]));
    if (m.status !== "有效") 容器.appendChild(h("p", { class: "提醒" }, "您的會籍狀態為「" + m.status + "」，如有疑問請洽協會。"));
    容器.appendChild(h("div", { class: "卡" }, h("div", { class: "表單" },
      列("會員編號", m.member_no), 列("姓名", m.name), 列("性別", m.gender), 列("服務機關", m.agency), 列("服務單位", m.unit),
      列("職稱", m.title), 列("登入 Email（協會寄信用）", 連線.帳號.email), 列("名冊上的公務信箱（只存資料）", m.email), 列("公務電話", m.phone), 列("入會日期", 民國(m.join_date)), 列("會籍", m.status),
      h("div", { class: "欄 寬" }, h("span", null, "協會職務"), h("div", { class: "標籤組" }, 職務標籤(m))))));
    容器.appendChild(await 退會卡(m));
  }
});

// 我的資料下方的「退會」卡片（v2.7）：送出退會申請、看審核結果、撤回
async function 退會卡(m) {
  let 申 = null;
  // 讀不到（例如資料庫還沒更新到這一版）就先不顯示退會卡，我的資料其他部分照常顯示
  try { 申 = (await 查詢("removal_requests", { member_id: m.id, by_self: true }, "requested_at.desc"))[0] || null; }
  catch (e) { return h("div"); }
  const 卡 = h("div", { class: "卡", id: "退會卡", style: "margin-top:1rem" }, h("h2", null, "退會"));
  if (申 && 申.status === "待刪除") {
    卡.appendChild(h("p", null, "您於 " + 民國時間(申.requested_at) + " 送出的退會申請正在審核（原因：" + 申.reason + "）。"));
    卡.appendChild(h("button", { class: "鈕", type: "button", id: "撤回退會鈕", onclick: async function () {
      if (!(await 確認("撤回這件退會申請？撤回後仍是協會會員。", "撤回申請"))) return;
      try { await 呼叫("cancel_my_removal"); 提示("已撤回退會申請"); 重新繪製(); } catch (e) { 提示(e.message, true); }
    } }, "撤回申請"));
    return 卡;
  }
  if (m.status === "退會") {
    卡.appendChild(h("p", null, "您的會籍是「退會」。" + (申 && 申.status === "已退會" ? "（退會申請已於 " + 民國時間(申.reviewed_at) + " 處理）" : "") + "如要恢復會籍，請洽協會。"));
    return 卡;
  }
  if (申 && 申.status === "退回") 卡.appendChild(h("p", { class: "提醒" }, "上次的退會申請已於 " + 民國時間(申.reviewed_at) + " 退回" + (申.review_note ? "：" + 申.review_note : "") + "，如有疑問請洽協會。"));
  卡.appendChild(h("p", { class: "次要字" }, "要退出協會，請送出退會申請，由協會審核。"));
  卡.appendChild(h("button", { class: "鈕 危", type: "button", id: "申請退會鈕", onclick: 申請本人退會 }, "申請退會"));
  return 卡;
}

// 刪除（退會）原因的選項：幹部刪除會員、會員本人申請退會都用下拉選單選；選「其他」時另外填寫
const 刪除原因們 = ["退休", "離職", "調他機關", "不續會", "亡故", "其他"];

// 原因的表單欄位：下拉選單＋「其他」的文字方塊
function 原因欄位(選項們) {
  return [{ key: "reason", 標題: "原因", 類型: "選單", 選項: 選項們, 必填: true },
    { key: "其他", 標題: "其他原因（選「其他」時填寫）" }];
}

// 把表單上的原因組成一段文字（選「其他」沒有填內容時回空字串）
function 組原因(值) {
  const 選 = String(值.reason || "").trim();
  if (選 !== "其他") return 選;
  const 填 = String(值.其他 || "").trim();
  return 填 ? "其他：" + 填 : "";
}

// 會員本人送出退會申請（下拉選原因）
function 申請本人退會() {
  表單對話框("申請退會", 原因欄位(刪除原因們.filter(function (x) { return x !== "亡故"; })), {}, async function (值) {
    const 原因 = 組原因(值);
    if (!原因) return 值.reason === "其他" ? "請填寫其他原因" : "請選擇退會原因";
    try { await 呼叫("request_my_removal", { p_reason: 原因 }); 提示("已送出退會申請，請等協會審核"); 重新繪製(); }
    catch (e) { return e.message; }
  }, { 儲存文字: "送出退會申請", 前言: "送出後由協會審核。核准後您的會員資料會刪除（繳費收據仍保留在協會帳務紀錄）；登入帳號仍可登入，但不再是會員。\n審核前可以撤回。" });
}

// 修改自己的資料（只能改性別、服務機關、單位、職稱、電話）
function 修改我的資料() {
  const m = 線上.會員;
  const 機關們 = 預設服務機關.indexOf(m.agency) >= 0 || !m.agency ? 預設服務機關 : 預設服務機關.concat([m.agency]);
  表單對話框("修改我的資料", [
    { key: "gender", 標題: "性別", 類型: "選單", 選項: ["女", "男"] },
    { key: "agency", 標題: "服務機關", 類型: "選單", 選項: 機關們, 必填: true },
    { key: "unit", 標題: "服務單位" }, { key: "title", 標題: "職稱" }, { key: "phone", 標題: "公務電話" }
  ], m, async function (值) {
    try {
      await 呼叫("update_my_profile", { p_gender: 值.gender, p_agency: 值.agency, p_unit: 值.unit, p_title: 值.title, p_phone: 值.phone });
      await 重新讀取我的資料();
      提示("已更新您的資料");
      重新繪製();
    } catch (e) { return e.message; }
  });
}

// 修改登入密碼
function 修改我的密碼() {
  表單對話框("修改密碼", [
    { key: "新", 標題: "新密碼（至少 6 個字元）", 類型: "密碼", 必填: true },
    { key: "再", 標題: "再輸入一次", 類型: "密碼", 必填: true }
  ], {}, async function (值) {
    if (值.新.length < 6) return "密碼至少 6 個字元";
    if (值.新 !== 值.再) return "兩次輸入的密碼不一樣";
    try { await 改密碼(值.新); 提示("密碼已修改"); } catch (e) { return e.message; }
  });
}

註冊頁面("活動報名", {
  圖示: "📅",
  可見: function () { return !!線上.會員; },
  說明: "列出協會公開的活動。按「我要報名」即完成報名；需要用餐的活動請選葷食或素食。名額滿了會自動列候補，有人取消時依報名順序遞補。活動當天以前都可以取消報名。",
  繪製: async function (容器) {
    容器.appendChild(頁首("活動報名"));
    const 區 = h("div", null, h("p", { class: "次要字" }, "讀取中…"));
    容器.appendChild(區);
    const [活動們, 我的, 人數] = await Promise.all([
      查詢("activities", { is_public: true }, "date.asc"),
      查詢("registrations", { member_id: 線上.會員.id }, "created_at.desc"),
      呼叫("activity_counts")
    ]);
    const 數 = {};
    (人數 || []).forEach(function (x) { 數[x.activity_id] = x; });
    const 今 = 今天();
    const 近期 = 活動們.filter(function (a) { return a.date >= 今; });
    const 我報 = function (a) { return 我的.find(function (r) { return r.activity_id === a.id && r.status !== "取消"; }); };
    清空(區);
    if (!近期.length) 區.appendChild(h("p", { class: "次要字" }, "目前沒有開放的活動"));
    區.appendChild(h("div", { class: "格2" }, 近期.map(function (a) {
      const r = 我報(a);
      const c = 數[a.id] || { confirmed: 0, waitlisted: 0 };
      const 截止 = a.deadline && a.deadline < 今;
      const 可報 = 線上.會員.status === "有效" && !截止 && !r;
      return h("div", { class: "卡", dataset: { id: a.id } },
        h("div", { class: "小字 次要字" }, 民國(a.date) + " " + (a.start_time || "") + (a.end_time ? "–" + a.end_time : "") + (a.category ? "　" + a.category : "")),
        h("h2", null, a.name),
        h("p", { class: "次要字", style: "margin:.2rem 0" }, "地點：" + (a.location || "另行通知") + "　費用：" + (a.fee ? 金額(a.fee) + " 元" : "免費")),
        h("p", { class: "次要字", style: "margin:.2rem 0" }, "名額：" + (a.capacity ? "已報名 " + c.confirmed + "／" + a.capacity + (c.waitlisted ? "，候補 " + c.waitlisted : "") : "不限") +
          (a.deadline ? "　截止：" + 民國(a.deadline) : "") + (a.meal_option ? "　需選葷素" : "")),
        a.description ? h("p", { style: "white-space:pre-wrap" }, a.description) : null,
        r ? h("p", null, h("span", { class: "標記 " + (r.status === "正取" ? "成" : "金") }, "您已報名：" + r.status), r.meal ? " " + r.meal + "食" : "") : null,
        h("div", { class: "表工具列" },
          可報 ? h("button", { class: "鈕 主", type: "button", onclick: function () { 報名對話框(a); } }, "我要報名") : null,
          r && a.date >= 今 ? h("button", { class: "鈕 危", type: "button", onclick: async function () {
            if (!(await 確認("確定取消「" + a.name + "」的報名？", "取消報名"))) return;
            try { await 呼叫("cancel_registration", { p_registration: r.id }); 提示("已取消報名"); 重新繪製(); } catch (e) { 提示(e.message, true); }
          } }, "取消報名") : null,
          截止 && !r ? h("span", { class: "標記 警" }, "報名已截止") : null));
    })));
    const 過去 = 我的.filter(function (r) { const a = 活動們.find(function (x) { return x.id === r.activity_id; }); return a && a.date < 今; });
    if (過去.length) {
      區.appendChild(h("h2", { style: "margin-top:1.5rem" }, "我參加過的活動"));
      區.appendChild(h("ul", { class: "清單" }, 過去.map(function (r) {
        const a = 活動們.find(function (x) { return x.id === r.activity_id; });
        return h("li", null, h("span", { class: "標記" }, 民國(a.date)), a.name, h("span", { class: "次要字 小字", style: "margin-left:auto" }, r.status + (r.checked_in_at ? "、已簽到" : "")));
      })));
    }
  }
});

// 報名對話框：需要時選葷或素，可填備註
function 報名對話框(a) {
  const 欄位們 = [];
  if (a.meal_option) 欄位們.push({ key: "meal", 標題: "用餐", 類型: "選單", 選項: [{ 值: "葷", 字: "葷食" }, { 值: "素", 字: "素食" }], 必填: true });
  欄位們.push({ key: "note", 標題: "備註（例如攜眷人數、特殊需求）", 寬: true });
  表單對話框("報名：" + a.name, 欄位們, {}, async function (值) {
    try {
      const 結果 = await 呼叫("register_activity", { p_activity: a.id, p_meal: 值.meal || "", p_note: 值.note || "" });
      提示(結果 === "候補" ? "已報名，目前列為候補" : "報名成功（正取）");
      重新繪製();
    } catch (e) { return e.message; }
  }, { 儲存文字: "確認報名" });
}

註冊頁面("繳費紀錄", {
  圖示: "＄",
  可見: function () { return !!線上.會員; },
  說明: "列出您歷年的會費繳納紀錄與收據號。如有疑問請洽協會會計。",
  繪製: async function (容器) {
    容器.appendChild(頁首("繳費紀錄"));
    const 費 = await 查詢("fees", { member_id: 線上.會員.id }, "year.desc");
    if (!費.length) { 容器.appendChild(h("p", { class: "次要字" }, "目前沒有繳費紀錄")); return; }
    容器.appendChild(h("div", { class: "表捲" }, h("table", { class: "表" },
      h("thead", null, h("tr", null, ["年度", "項目", "金額", "繳費日", "方式", "收據號"].map(function (t) { return h("th", { class: t === "金額" ? "數" : "" }, t); }))),
      h("tbody", null, 費.map(function (f) {
        return h("tr", null, h("td", null, 民國年(f.year) + " 年度"), h("td", null, f.item), h("td", { class: "數" }, 金額(f.amount)),
          h("td", null, 民國(f.paid_date)), h("td", null, f.method), h("td", null, f.receipt_no));
      })))));
  }
});

註冊頁面("連結會員資料", {
  圖示: "🔗",
  可見: function () { return !線上.會員; },
  說明: "您的帳號還沒連到名冊上的會員資料。請送出連結申請，由協會核對名冊後連結（也可以請協會直接替您建立帳號）。還不是會員，請改用「入會申請」。",
  繪製: function (容器) {
    容器.appendChild(頁首("連結會員資料"));
    容器.appendChild(h("p", { class: "次要字" }, "登入帳號：" + 連線.帳號.email + "（協會的通知與重設密碼信都寄到這個 Email）。已經是協會會員的同仁，請送出連結申請，協會核對名冊後就會連到您的資料；還不是會員請到「入會申請」。"));
    const 申 = 線上.連結申請;
    const 卡 = h("div", { class: "卡" }, h("h2", null, "送出連結申請"));
    容器.appendChild(卡);
    if (申 && 申.status === "待審") {
      卡.appendChild(h("p", null, "您於 " + 民國時間(申.created_at) + " 送出的連結申請正在審核，協會核對名冊後就會連結，屆時重新登入即可。"));
      return;
    }
    if (申 && 申.status === "退回") 卡.appendChild(h("p", { class: "提醒" }, "上次的連結申請已退回" + (申.review_note ? "：" + 申.review_note : "") + "。可修正後重新送出。"));
    const 欄位們 = [
      { key: "name", 標題: "姓名", 必填: true }, { key: "agency", 標題: "服務機關", 類型: "選單", 選項: 預設服務機關.concat(["其他"]), 必填: true },
      { key: "unit", 標題: "服務單位" }, { key: "title", 標題: "職稱" },
      { key: "office_email", 標題: "名冊上的公務信箱（只用來核對，不會寄信）", 類型: "Email" }, { key: "phone", 標題: "公務電話" },
      { key: "note", 標題: "備註", 類型: "多行", 行數: 2 }
    ];
    const 表單 = h("form", { class: "表單", onsubmit: function (e) { e.preventDefault(); } }, 欄位們.map(function (f) { return 表單欄位(f, 申 ? 申[f.key] : ""); }));
    const 錯 = h("p", { class: "錯誤", role: "alert" });
    卡.appendChild(h("p", { class: "次要字" }, "請填寫和協會名冊一致的資料，協會核對後連結。"));
    卡.appendChild(表單);
    卡.appendChild(錯);
    卡.appendChild(h("button", { class: "鈕", type: "button", id: "送出連結申請鈕", onclick: async function () {
      const 值 = 讀表單(表單, 欄位們);
      if (!值.name || !值.agency) return (錯.textContent = "請填寫姓名與服務機關");
      try {
        await 呼叫("submit_link_request", { p_name: 值.name, p_agency: 值.agency, p_unit: 值.unit, p_title: 值.title, p_office_email: 值.office_email, p_phone: 值.phone, p_note: 值.note });
        await 重新讀取我的資料();
        提示("已送出連結申請");
        重新繪製();
      } catch (e) { 錯.textContent = e.message; }
    } }, "送出連結申請"));
  }
});

註冊頁面("入會申請", {
  圖示: "✍",
  可見: function () { return !線上.會員; },
  說明: "財政部及所屬機關的現職公務人員可以申請入會。送出後由協會審核，核准後重新登入就能使用會員功能。",
  繪製: function (容器) {
    容器.appendChild(頁首("入會申請"));
    const 申 = 線上.申請;
    if (申 && 申.status === "待審") {
      容器.appendChild(h("div", { class: "卡" }, h("h2", null, "申請審核中"),
        h("p", null, "您於 " + 民國時間(申.created_at) + " 送出的入會申請正在審核，核准後重新登入即可使用會員功能。")));
      return;
    }
    if (申 && 申.status === "退回") 容器.appendChild(h("p", { class: "提醒" }, "您上次的申請已退回" + (申.review_note ? "：" + 申.review_note : "") + "。可修正後重新申請。"));
    if (申 && 申.status === "核准") 容器.appendChild(h("p", { class: "提醒" }, "您的申請已核准，請重新登入。"));
    const 欄位們 = [
      { key: "name", 標題: "姓名", 必填: true }, { key: "gender", 標題: "性別", 類型: "選單", 選項: ["女", "男"] },
      { key: "employee_no", 標題: "員工編號" }, { key: "agency", 標題: "服務機關", 類型: "選單", 選項: 預設服務機關.concat(["其他"]), 必填: true },
      { key: "unit", 標題: "服務單位" }, { key: "title", 標題: "職稱" }, { key: "phone", 標題: "公務電話" },
      { key: "email", 標題: "公務電子郵件信箱", 類型: "Email", 說明: "只列入名冊存資料、不會寄信；協會的通知與重設密碼信都寄到您登入用的 Email" },
      { key: "note", 標題: "備註", 類型: "多行", 行數: 2 },
      { key: "同意", 標題: "個人資料告知", 類型: "勾選", 勾選文字: "我同意協會僅為辦理入會及會務蒐集、處理及利用以上資料" }
    ];
    const 表單 = h("form", { class: "表單", onsubmit: function (e) { e.preventDefault(); } }, 欄位們.map(function (f) { return 表單欄位(f, 申 ? 申[f.key] : ""); }));
    const 錯 = h("p", { class: "錯誤", role: "alert" });
    容器.appendChild(h("div", { class: "卡" },
      h("p", null, "登入帳號：" + 連線.帳號.email + "（協會的通知都寄到這個 Email）。已經是會員的同仁請改用「連結會員資料」，不用重新申請。"), 表單, 錯,
      h("button", { class: "鈕 主", type: "button", id: "送出申請鈕", onclick: async function () {
        const 值 = 讀表單(表單, 欄位們);
        if (!值.name || !值.agency) return (錯.textContent = "請填寫姓名與服務機關");
        if (!值.同意) return (錯.textContent = "請勾選同意個人資料告知");
        try {
          await 呼叫("submit_application", { p_name: 值.name, p_gender: 值.gender, p_employee_no: 值.employee_no, p_agency: 值.agency,
            p_unit: 值.unit, p_title: 值.title, p_phone: 值.phone, p_note: 值.note, p_email: 值.email });
          await 重新讀取我的資料();
          提示("已送出入會申請");
          重新繪製();
        } catch (e) { 錯.textContent = e.message; }
      } }, "送出申請")));
  }
});
