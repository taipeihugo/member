// 檔案說明：設定（服務機關、會員類別與標籤、會費標準、會計科目、使用者與角色、備份份數）與操作紀錄

註冊頁面("設定", {
  圖示: "⚙",
  可見: function () { return 可("設定.編輯"); },
  說明: "「基本清單」維護服務機關（預設依《財政部組織法》第 5 條所列次級機關，組織調整時請增刪）、會員類別、會員標籤、活動類別、消息分類與備份份數。「會費標準」設定入會費與常年會費（依章程，經會員大會議決）。「會計科目」可自訂；預設科目依《公務人員協會法》第 27 條經費來源整理。「使用者與角色」新增可登入的幹部並設定角色、重設密碼、停用帳號。角色只控制畫面上的功能，不是真正的資安控管。協會簡介與聯絡資訊請到「官網發布 → 協會簡介」修改。",
  繪製: function (容器, 參數) {
    容器.appendChild(頁首("設定"));
    const 頁籤 = 建立頁籤(["基本清單", "會費標準", "會計科目", "使用者與角色"], 參數.頁籤, function (名, 區) {
      if (名 === "基本清單") 繪製基本清單(區);
      else if (名 === "會費標準") 繪製會費標準(區);
      else if (名 === "會計科目") 繪製會計科目(區);
      else 繪製使用者(區);
    });
    容器.appendChild(頁籤.元素);
  }
});

// 「基本清單」：每行一項的清單設定
function 繪製基本清單(區) {
  const 設 = 狀態.資料.設定;
  const 清單們 = [["服務機關", "服務機關（每行一個）"], ["會員類別", "會員類別"], ["會員標籤", "會員標籤"], ["活動類別", "活動類別"], ["消息分類", "最新消息分類"]];
  const 框們 = {};
  const 表單 = h("div", { class: "表單" }, 清單們.map(function (x) {
    const 框 = h("textarea", { rows: x[0] === "服務機關" ? 12 : 5, "aria-label": x[1] });
    框.value = (設[x[0]] || []).join("\n");
    框們[x[0]] = 框;
    return h("div", { class: "欄" }, h("span", null, x[1]), 框);
  }));
  const 備份 = h("input", { type: "number", min: 5, max: 200, value: 設.備份份數 || 30, id: "備份份數" });
  區.appendChild(h("div", { class: "卡" }, 表單,
    h("p", null, h("label", null, "自動備份保留份數 ", 備份)),
    h("button", { class: "鈕 主", type: "button", onclick: function () {
      const 變更 = {};
      清單們.forEach(function (x) { 變更[x[0]] = 框們[x[0]].value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean); });
      if (!變更.服務機關.length || !變更.會員類別.length) return 提示("服務機關與會員類別至少要一項", true);
      變更.備份份數 = Math.max(5, Number(備份.value) || 30);
      更新設定(變更);
      提示("已儲存設定");
    } }, "儲存")));
}

// 「會費標準」：入會費、常年會費
function 繪製會費標準(區) {
  const 設 = 狀態.資料.設定;
  const 欄位們 = [{ key: "入會費", 標題: "入會費（元）", 類型: "金額", 最小: 0 }, { key: "常年會費", 標題: "常年會費（元／年）", 類型: "金額", 最小: 0 }];
  const 表單 = h("form", { class: "表單", onsubmit: function (e) { e.preventDefault(); } }, 欄位們.map(function (f) { return 表單欄位(f, 設.會費標準[f.key]); }));
  區.appendChild(h("div", { class: "卡" },
    h("p", { class: "次要字" }, "依《公務人員協會法》第 27 條，入會費與常年會費的數額及繳納方式須經會員（代表）大會議決，並訂入章程。"),
    表單,
    h("p", null, h("button", { class: "鈕 主", type: "button", id: "儲存會費標準鈕", onclick: function () {
      const 值 = 讀表單(表單, 欄位們);
      更新設定({ 會費標準: { 入會費: Number(值.入會費) || 0, 常年會費: Number(值.常年會費) || 0 } });
      提示("已儲存會費標準");
    } }, "儲存"))));
}

// 「會計科目」：可新增、修改、刪除（已用過的科目不可刪）
function 繪製會計科目(區) {
  const 重畫 = function () { 清空(區); 繪製會計科目(區); };
  const 設 = 狀態.資料.設定;
  const 欄位們 = [{ key: "代碼", 標題: "代碼", 必填: true }, { key: "名稱", 標題: "科目名稱", 必填: true }, { key: "類別", 標題: "類別", 類型: "選單", 選項: ["收入", "支出"], 必填: true }];
  const 編輯 = function (原) {
    表單對話框(原 ? "編輯科目" : "新增科目", 欄位們, 原 || { 類別: "支出" }, function (值) {
      const 科目們 = 設.會計科目.slice();
      if (科目們.some(function (k) { return k.代碼 === 值.代碼 && k !== 原; })) return "代碼重複";
      if (原) {
        if (原.代碼 !== 值.代碼 && 集合("傳票").some(function (v) { return v.科目 === 原.代碼; })) return "這個科目已有傳票使用，不能改代碼";
        科目們[科目們.indexOf(原)] = 值;
      } else 科目們.push(值);
      科目們.sort(function (a, b) { return 比較(a.代碼, b.代碼); });
      更新設定({ 會計科目: 科目們 });
      重畫();
    }, 原 ? { 額外按鈕: [{ 文字: "刪除", 危: true, 動作: function (關) {
      if (集合("傳票").some(function (v) { return v.科目 === 原.代碼; })) { 提示("這個科目已有傳票使用，不能刪除", true); return false; }
      更新設定({ 會計科目: 設.會計科目.filter(function (k) { return k !== 原; }) });
      關(null); 重畫();
    } }] } : null);
  };
  區.appendChild(h("p", { class: "次要字 小字" }, "預設科目依《公務人員協會法》第 27 條經費來源整理。正式報表請對照銓敘部《公務人員協會財務處理作業規定》所定科目（資產、負債、基金暨餘絀、收入、支出五類）。"));
  區.appendChild(h("div", { class: "表工具列" }, h("button", { class: "鈕 主 小", type: "button", onclick: function () { 編輯(null); } }, "＋ 新增科目")));
  區.appendChild(h("div", { class: "表捲" }, h("table", { class: "表" },
    h("thead", null, h("tr", null, h("th", null, "代碼"), h("th", null, "科目名稱"), h("th", null, "類別"), h("th", null, "已用傳票"))),
    h("tbody", null, 設.會計科目.map(function (k) {
      return h("tr", { class: "可點", onclick: function () { 編輯(k); } }, h("td", null, k.代碼), h("td", null, k.名稱), h("td", null, k.類別),
        h("td", null, 集合("傳票").filter(function (v) { return v.科目 === k.代碼; }).length));
    })))));
}

// 「使用者與角色」：新增使用者、改角色、重設密碼、停用
function 繪製使用者(區) {
  const 重畫 = function () { 清空(區); 繪製使用者(區); };
  區.appendChild(h("p", { class: "提醒" }, "角色只決定畫面上能做什麼、簽核由誰簽，不是真正的資安控管。真正的保護是共用資料夾的存取權限，請由資訊單位設定。"));
  區.appendChild(h("div", { class: "表工具列" }, h("button", { class: "鈕 主 小", type: "button", id: "新增使用者鈕", onclick: function () {
    表單對話框("新增使用者", [
      { key: "姓名", 標題: "姓名", 必填: true }, { key: "角色", 標題: "角色", 類型: "選單", 選項: 角色清單, 必填: true, 預設: "承辦人" },
      { key: "密碼", 標題: "初始密碼（至少 8 個字元）", 類型: "密碼", 必填: true }
    ], {}, async function (值) {
      if (集合("使用者").some(function (u) { return u.姓名 === 值.姓名; })) return "已有同名的使用者";
      const 錯 = 檢查密碼(值.密碼);
      if (錯) return 錯;
      新增紀錄("使用者", Object.assign({ 姓名: 值.姓名, 角色: 值.角色, 停用: false }, await 產生密碼紀錄(值.密碼)));
      提示("已新增使用者，請告知對方初始密碼並請其登入後修改");
      重畫();
    });
  } }, "＋ 新增使用者")));
  區.appendChild(h("div", { class: "表捲" }, h("table", { class: "表" },
    h("thead", null, h("tr", null, ["姓名", "角色", "狀態", "最後修改", ""].map(function (t) { return h("th", null, t); }))),
    h("tbody", null, 集合("使用者").map(function (u) {
      const 是自己 = u.id === 狀態.使用者.id;
      return h("tr", null, h("td", null, u.姓名 + (是自己 ? "（您）" : "")), h("td", null, u.角色),
        h("td", null, h("span", { class: "標記 " + (u.停用 ? "危" : "成") }, u.停用 ? "停用" : "啟用")), h("td", null, 民國時間(u.修改時間)),
        h("td", null,
          h("button", { class: "鈕 小", type: "button", onclick: function () {
            表單對話框("變更角色：" + u.姓名, [{ key: "角色", 標題: "角色", 類型: "選單", 選項: 角色清單, 必填: true }], u, function (值) {
              if (是自己 && !["理事長", "秘書長"].includes(值.角色)) return "不能把自己改成無法管理設定的角色";
              更新紀錄("使用者", u.id, { 角色: 值.角色 }); 重畫();
            });
          } }, "角色"),
          h("button", { class: "鈕 小", type: "button", onclick: function () {
            表單對話框("重設密碼：" + u.姓名, [{ key: "密碼", 標題: "新密碼（至少 8 個字元）", 類型: "密碼", 必填: true }], {}, async function (值) {
              const 錯 = 檢查密碼(值.密碼);
              if (錯) return 錯;
              更新紀錄("使用者", u.id, await 產生密碼紀錄(值.密碼), "重設「" + u.姓名 + "」密碼");
              提示("已重設密碼");
            });
          } }, "重設密碼"),
          是自己 ? null : h("button", { class: "鈕 小", type: "button", onclick: function () {
            更新紀錄("使用者", u.id, { 停用: !u.停用 }, (u.停用 ? "啟用「" : "停用「") + u.姓名 + "」"); 重畫();
          } }, u.停用 ? "啟用" : "停用")));
    })))));
}

註冊頁面("操作紀錄", {
  圖示: "📜",
  可見: function () { return 可("紀錄.檢視"); },
  說明: "列出誰在什麼時間新增、修改、刪除了什麼資料（最多保留最近 5000 筆，存在資料檔裡）。可搜尋、篩選與匯出。",
  繪製: function (容器) {
    容器.appendChild(頁首("操作紀錄"));
    const 人們 = function () { return Array.from(new Set(集合("操作紀錄").map(function (x) { return x.人; }))).sort(比較); };
    容器.appendChild(資料表({
      匯出檔名: "操作紀錄",
      資料: function () { return 集合("操作紀錄"); },
      預設排序: { key: "時間", 反向: true },
      每頁: 30,
      欄位: [
        { key: "時間", 標題: "時間", 顯示: function (r) { return 民國時間(r.時間); } },
        { key: "人", 標題: "操作人" }, { key: "動作", 標題: "動作" }, { key: "對象", 標題: "對象" }, { key: "說明", 標題: "說明" }
      ],
      篩選: [
        { 標題: "操作人", 選項: 人們, 取值: function (r) { return r.人; } },
        { 標題: "動作", 選項: ["新增", "修改", "刪除", "登入", "匯入", "發布", "建立"], 取值: function (r) { return r.動作; } }
      ]
    }).元素);
  }
});
