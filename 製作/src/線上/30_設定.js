// 檔案說明：系統設定（具管理權限的幹部才看得到）：增刪幹部角色、理監事職稱，調整順序，查看目前的幹部名單

註冊頁面("系統設定", {
  圖示: "⚙",
  可見: 是管理者,
  說明: "「幹部角色」：會員管理裡「幹部角色」選單的選項。勾選「管理權限」的角色可以指派幹部角色、建立登入帳號、重設密碼、解除帳號連結、刪除會員、修改系統設定（預設是理事長、秘書長、總幹事）；沒勾的角色（例如會計、承辦人）可以看全體名冊、處理申請、活動與會費。「理監事職稱」：每個職稱要歸類為理事或監事（兩者互斥，會員代表另外勾選）。還有會員在用的角色或職稱不能刪除，請先到「會員管理」改掉。用 ↑ ↓ 調整選單上的順序。",
  繪製: async function (容器) {
    await 讀取系統設定();
    const 名冊 = await 查詢("members", null, "member_no.asc");
    const 人數 = function (欄, 值) { return 名冊.filter(function (m) { return m[欄] === 值; }).length; };
    容器.appendChild(頁首("系統設定"));
    容器.appendChild(角色設定卡(人數));
    容器.appendChild(職稱設定卡(人數));
    容器.appendChild(幹部名單卡(名冊));
  }
});

// 呼叫一個設定函式；成功就重新讀取設定並重畫這一頁，失敗就顯示原因
async function 改設定(函式, 參數, 成功訊息) {
  try {
    await 呼叫(函式, 參數);
    await 讀取系統設定();
    if (成功訊息) 提示(成功訊息);
    // 自己的角色被取消管理權限時，這一頁就看不到了，回到我的資料
    if (!是管理者()) { 更新外框(); 前往("我的資料"); return; }
    重新繪製();
  } catch (e) { 提示(e.message, true); }
}

// 把清單中第 i 項往上（方向 -1）或往下（方向 1）移一格，回傳新的名稱順序
function 移動順序(名稱們, i, 方向) {
  const 新 = 名稱們.slice();
  const j = i + 方向;
  if (j < 0 || j >= 新.length) return null;
  const 暫 = 新[i]; 新[i] = 新[j]; 新[j] = 暫;
  return 新;
}

// 上移、下移兩個小按鈕
function 順序按鈕(名稱們, i, 函式, 參數名) {
  const 鈕 = function (文字, 方向, 標題) {
    const 新 = 移動順序(名稱們, i, 方向);
    return h("button", { class: "鈕 小 文字", type: "button", title: 標題, disabled: !新, onclick: function () {
      const 參 = {}; 參[參數名] = 新; 改設定(函式, 參);
    } }, 文字);
  };
  return [鈕("↑", -1, "往上移"), 鈕("↓", 1, "往下移")];
}

// 幹部角色設定卡片：清單（管理權限、人數、順序、刪除）＋新增
function 角色設定卡(人數) {
  const 角色們 = 線上.角色們;
  const 名稱們 = 角色們.map(function (r) { return r.name; });
  const 列們 = 角色們.map(function (r, i) {
    const 數 = 人數("staff_role", r.name);
    const 勾 = h("input", { type: "checkbox", checked: !!r.is_admin, "aria-label": r.name + " 具管理權限" });
    勾.addEventListener("change", async function () {
      const 要 = 勾.checked;
      const 好 = await 確認(要 ? "讓「" + r.name + "」具管理權限？\n擔任這個角色的人可以指派幹部角色、建立登入帳號、重設密碼、刪除會員、修改系統設定。"
        : "取消「" + r.name + "」的管理權限？\n擔任這個角色的人將不能再指派幹部、建立帳號或修改系統設定。", 要 ? "給予管理權限" : "取消管理權限");
      if (!好) { 勾.checked = !要; return; }
      改設定("set_staff_role_admin", { p_name: r.name, p_is_admin: 要 }, "已更新「" + r.name + "」的權限");
    });
    return h("tr", { dataset: { role: r.name } },
      h("td", null, 順序按鈕(名稱們, i, "reorder_staff_roles", "p_names")),
      h("td", null, h("strong", null, r.name)),
      h("td", null, h("label", null, 勾, " 管理權限")),
      h("td", { class: "數" }, 數 + " 人"),
      h("td", null, h("button", { class: "鈕 小 危", type: "button", disabled: 數 > 0, title: 數 > 0 ? "還有會員是這個角色，請先改掉" : "", onclick: async function () {
        if (!(await 確認("刪除幹部角色「" + r.name + "」？", "刪除"))) return;
        改設定("delete_staff_role", { p_name: r.name }, "已刪除「" + r.name + "」");
      } }, "刪除")));
  });
  const 名 = h("input", { id: "新角色", placeholder: "例：副秘書長", maxlength: 20, style: "max-width:200px" });
  const 管 = h("input", { type: "checkbox", id: "新角色管理" });
  return h("div", { class: "卡" },
    h("h2", null, "幹部角色"),
    h("div", { class: "表捲" }, h("table", { class: "表", id: "角色表" },
      h("thead", null, h("tr", null, ["順序", "角色", "權限", "目前人數", ""].map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 列們))),
    h("div", { class: "表工具列", style: "margin-top:.6rem" }, 名, h("label", null, 管, " 具管理權限"),
      h("button", { class: "鈕 主", type: "button", id: "新增角色鈕", onclick: function () {
        if (!名.value.trim()) return 提示("請填寫角色名稱", true);
        改設定("add_staff_role", { p_name: 名.value, p_is_admin: 管.checked }, "已新增「" + 名.value.trim() + "」");
      } }, "＋ 新增角色")));
}

// 理監事職稱設定卡片：清單（類別、人數、順序、刪除）＋新增
function 職稱設定卡(人數) {
  const 職稱們 = 線上.職稱們;
  const 名稱們 = 職稱們.map(function (t) { return t.title; });
  const 列們 = 職稱們.map(function (t, i) {
    const 數 = 人數("board_title", t.title);
    return h("tr", { dataset: { title: t.title } },
      h("td", null, 順序按鈕(名稱們, i, "reorder_board_titles", "p_titles")),
      h("td", null, h("strong", null, t.title)),
      h("td", null, h("span", { class: "標記 " + (t.board_role === "理事" ? "金" : "") }, t.board_role)),
      h("td", { class: "數" }, 數 + " 人"),
      h("td", null, h("button", { class: "鈕 小 危", type: "button", disabled: 數 > 0, title: 數 > 0 ? "還有會員是這個職稱，請先改掉" : "", onclick: async function () {
        if (!(await 確認("刪除理監事職稱「" + t.title + "」？", "刪除"))) return;
        改設定("delete_board_title", { p_title: t.title }, "已刪除「" + t.title + "」");
      } }, "刪除")));
  });
  const 名 = h("input", { id: "新職稱", placeholder: "例：候補理事", maxlength: 20, style: "max-width:200px" });
  const 類 = h("select", { id: "新職稱類別" }, h("option", { value: "理事" }, "屬於理事"), h("option", { value: "監事" }, "屬於監事"));
  return h("div", { class: "卡", style: "margin-top:1rem" },
    h("h2", null, "理監事職稱"),
    h("p", { class: "次要字 小字" }, "一位會員只能有一個職稱，所以理事、監事互斥；「會員代表」在會員資料另外勾選，可與任一職稱並存。"),
    h("div", { class: "表捲" }, h("table", { class: "表", id: "職稱表" },
      h("thead", null, h("tr", null, ["順序", "職稱", "類別", "目前人數", ""].map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 列們))),
    h("div", { class: "表工具列", style: "margin-top:.6rem" }, 名, 類,
      h("button", { class: "鈕 主", type: "button", id: "新增職稱鈕", onclick: function () {
        if (!名.value.trim()) return 提示("請填寫職稱", true);
        改設定("add_board_title", { p_title: 名.value, p_board_role: 類.value }, "已新增「" + 名.value.trim() + "」");
      } }, "＋ 新增職稱")));
}

// 目前的幹部名單（點一列開啟會員資料，可改幹部角色、建立帳號）
function 幹部名單卡(名冊) {
  const 順序 = {};
  線上.角色們.forEach(function (r, i) { 順序[r.name] = i; });
  const 幹部們 = 名冊.filter(function (m) { return m.staff_role; }).sort(function (a, b) { return (順序[a.staff_role] || 0) - (順序[b.staff_role] || 0); });
  const 機關們 = Array.from(new Set(預設服務機關.concat(名冊.map(function (m) { return m.agency; }).filter(Boolean))));
  return h("div", { class: "卡", style: "margin-top:1rem" },
    h("h2", null, "目前的幹部"),
    h("p", { class: "次要字 小字" }, "點一列可以改幹部角色、建立登入帳號或重設密碼。要新增幹部，請到「會員管理」點那位會員，選擇幹部角色。"),
    幹部們.length ? h("div", { class: "表捲" }, h("table", { class: "表", id: "幹部表" },
      h("thead", null, h("tr", null, ["幹部角色", "姓名", "服務機關", "登入帳號", "會籍"].map(function (t) { return h("th", null, t); }))),
      h("tbody", null, 幹部們.map(function (m) {
        return h("tr", { class: "可點", onclick: function () { 編輯線上會員(m, 機關們, 重新繪製); } },
          h("td", null, m.staff_role), h("td", null, m.name), h("td", null, m.agency),
          h("td", null, m.user_id ? "已有帳號" : h("span", { class: "標記 警" }, "沒有帳號")), h("td", null, m.status));
      })))) : h("p", { class: "次要字" }, "目前沒有幹部"));
}
