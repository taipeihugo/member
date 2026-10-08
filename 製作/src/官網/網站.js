// 檔案說明：官網各頁的畫面（內容全部來自 資料/site-data.js；入會申請與活動報名產生申請資料檔）

const 站 = window.SITE_DATA;
const 內容區 = document.getElementById("內容");
const 本頁 = document.body.getAttribute("data-page");
const 網址參數 = new URLSearchParams(location.search);

// 頁面標題（h1）
function 標題(文字) {
  return h("h1", null, 文字);
}

// 一個區段（小標題＋內容），可附「看更多」連結
function 區段(標, 內容, 更多連結, 更多文字) {
  return h("section", { class: "段" }, h("h2", null, 標, 更多連結 ? h("a", { href: 更多連結 }, 更多文字 || "看更多 →") : null), 內容);
}

// 多行文字（保留換行）
function 多行(文字, 類別) {
  return h("div", { class: "內文" + (類別 ? " " + 類別 : "") }, 文字 || "");
}

// 活動的日期時間文字
function 活動時間(a) {
  return 民國(a.日期) + (a.開始時間 ? " " + a.開始時間 + (a.結束時間 ? "–" + a.結束時間 : "") : "");
}

// 活動是否還可以報名（未過截止日、未過活動日、未額滿或還有候補）
function 可報名(a) {
  const 今 = 今天();
  if (a.日期 < 今) return false;
  if (a.截止日 && a.截止日 < 今) return false;
  return true;
}

// 共用外框：站名、頁面標題、範例資料提示、站尾聯絡資訊
function 設定外框() {
  const 協 = 站.協會;
  document.getElementById("站名").textContent = 協.名稱 || "協會官網";
  const 頁名 = document.title;
  document.title = 頁名 === "首頁" ? 協.名稱 : 頁名 + "｜" + 協.名稱;
  if (站.範例資料) document.getElementById("範例條").appendChild(h("div", { class: "寬度" }, h("p", { class: "範例條", style: "margin:.6rem 0 0" }, "本網站目前顯示的是範例資料（人名、電話、Email、金額全部虛構）")));
  清空(document.getElementById("站尾")).appendChild(h("div", null,
    h("p", null, h("strong", null, 協.名稱)),
    h("p", null, [協.地址 ? "地址：" + 協.地址 : "", 協.電話 ? "電話：" + 協.電話 : "", 協.Email ? "Email：" + 協.Email : ""].filter(Boolean).join("　")),
    h("p", { class: "小字" }, "資料更新：" + (站.發布時間 ? 民國時間(站.發布時間) : "—") + "　網站版本 " + 版本 + "　本網站不使用追蹤碼與 Cookie")));
}

// 選單開關（手機版）與深淺色切換
function 設定按鈕() {
  const 鈕 = document.getElementById("選單鈕");
  const 選單 = document.getElementById("主選單");
  鈕.addEventListener("click", function () {
    const 開 = 選單.classList.toggle("開");
    鈕.setAttribute("aria-expanded", 開 ? "true" : "false");
  });
  document.getElementById("主題鈕").addEventListener("click", function () {
    const 根 = document.documentElement;
    const 深 = 根.getAttribute("data-theme") ? 根.getAttribute("data-theme") === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    根.setAttribute("data-theme", 深 ? "light" : "dark");
  });
}

// 消息列表（ul）
function 消息清單(消息們) {
  if (!消息們.length) return h("p", { class: "次要字" }, "目前沒有消息");
  return h("ul", { class: "消息列" }, 消息們.map(function (n) {
    return h("li", null, h("span", { class: "日期" }, 民國(n.日期)), n.置頂 ? h("span", { class: "標記 危" }, "置頂") : null,
      n.分類 ? h("span", { class: "標記" }, n.分類) : null, h("a", { href: "news.html?id=" + encodeURIComponent(n.id) }, n.標題));
  }));
}

// 活動卡片
function 活動卡(a) {
  return h("div", { class: "卡" },
    h("div", { class: "日期" }, 活動時間(a)),
    h("h3", null, h("a", { href: "activities.html?id=" + encodeURIComponent(a.id) }, a.名稱)),
    h("p", { class: "次要字" }, [a.地點, a.類別].filter(Boolean).join(" · ")),
    可報名(a) ? h("span", { class: "標記 成" }, "報名中") : a.日期 < 今天() ? h("span", { class: "標記" }, "已結束") : h("span", { class: "標記 警" }, "已截止"));
}

// ===== 各頁 =====

// 首頁：主視覺、最新消息 5 則、近期活動、快速連結
function 首頁() {
  const 協 = 站.協會;
  const 近期 = 站.活動.filter(function (a) { return a.日期 >= 今天(); }).sort(function (a, b) { return 比較(a.日期, b.日期); }).slice(0, 3);
  清空(內容區).appendChild(h("div", { class: "主視覺" },
    h("img", { src: document.querySelector('link[rel="icon"]').getAttribute("href"), alt: "協會會徽" }),
    h("div", null, h("h1", null, 協.名稱), h("p", null, 協.標語 || ""),
      h("a", { class: "鈕 金", href: "join.html" }, "申請入會"), h("a", { class: "鈕", href: "activities.html" }, "活動報名"), h("a", { class: "鈕", href: "benefits.html" }, "會員福利"))));
  內容區.appendChild(區段("最新消息", 消息清單(站.消息.slice(0, 5)), "news.html"));
  內容區.appendChild(區段("近期活動", 近期.length ? h("div", { class: "格" }, 近期.map(活動卡)) : h("p", { class: "次要字" }, "目前沒有排定的活動"), "activities.html"));
  內容區.appendChild(區段("快速連結", h("div", { class: "快速" },
    h("a", { href: "join.html" }, h("strong", null, "入會申請"), h("span", null, "線上填寫、列印申請書")),
    h("a", { href: "benefits.html" }, h("strong", null, "會員福利"), h("span", null, "福利項目與特約商店")),
    h("a", { href: "rights.html" }, h("strong", null, "權益專區"), h("span", null, "建議與協商成果")),
    h("a", { href: "downloads.html" }, h("strong", null, "下載專區"), h("span", null, "表單、章程、會議紀錄")))));
}

// 關於協會：宗旨、沿革、組織架構圖、理監事名單、章程
function 關於協會() {
  const 協 = 站.協會;
  清空(內容區).appendChild(標題("關於協會"));
  if (協.宗旨) 內容區.appendChild(區段("宗旨", 多行(協.宗旨)));
  if (協.沿革) 內容區.appendChild(區段("沿革", 多行(協.沿革)));
  const 線 = function () { return h("div", { class: "線", "aria-hidden": "true" }); };
  內容區.appendChild(區段("組織架構", h("div", { class: "卡" }, h("div", { class: "組織圖", role: "img", "aria-label": "組織架構圖" },
    h("div", { class: "層" }, h("div", { class: "節點 頂" }, "會員（代表）大會")), 線(),
    h("div", { class: "層" }, h("div", { class: "節點" }, "理事會"), h("div", { class: "節點" }, "監事會")), 線(),
    h("div", { class: "層" }, h("div", { class: "節點" }, "理事長")), 線(),
    h("div", { class: "層" }, h("div", { class: "節點" }, "秘書長")), 線(),
    h("div", { class: "層" }, (協.組別 || []).map(function (g) { return h("div", { class: "節點 小" }, g); }))))));
  if (站.理監事.length) {
    內容區.appendChild(區段("理監事名單", h("div", { class: "表捲" }, h("table", { class: "表" },
      h("thead", null, h("tr", null, h("th", null, "職稱"), h("th", null, "姓名"), h("th", null, "服務機關"))),
      h("tbody", null, 站.理監事.map(function (p) { return h("tr", null, h("td", null, p.職稱), h("td", null, p.姓名), h("td", null, p.服務機關)); }))))));
  }
  if (協.章程) 內容區.appendChild(區段("章程", h("details", { class: "問答" }, h("summary", null, "展開章程全文"), 多行(協.章程))));
}

// 最新消息：列表＋分類篩選，或單則內文
function 最新消息() {
  const id = 網址參數.get("id");
  清空(內容區);
  if (id) {
    const n = 站.消息.find(function (x) { return x.id === id; });
    if (!n) { 內容區.appendChild(標題("找不到這則消息")); 內容區.appendChild(h("a", { href: "news.html" }, "← 回消息列表")); return; }
    document.title = n.標題 + "｜" + 站.協會.名稱;
    內容區.appendChild(h("p", null, h("a", { href: "news.html" }, "← 回消息列表")));
    內容區.appendChild(標題(n.標題));
    內容區.appendChild(h("p", { class: "日期" }, 民國(n.日期) + (n.分類 ? "　｜　" + n.分類 : "")));
    內容區.appendChild(h("article", { class: "卡" }, 多行(n.內文)));
    return;
  }
  內容區.appendChild(標題("最新消息"));
  const 分類們 = ["全部"].concat(Array.from(new Set(站.消息.map(function (n) { return n.分類; }).filter(Boolean))));
  const 列表區 = h("div");
  const 鈕列 = h("div", { class: "分類鈕", role: "group", "aria-label": "消息分類" });
  const 顯示 = function (分類) {
    Array.from(鈕列.children).forEach(function (b) { b.setAttribute("aria-pressed", b.textContent === 分類 ? "true" : "false"); });
    清空(列表區).appendChild(消息清單(站.消息.filter(function (n) { return 分類 === "全部" || n.分類 === 分類; })));
  };
  分類們.forEach(function (c) { 鈕列.appendChild(h("button", { class: "鈕 小", type: "button", onclick: function () { 顯示(c); } }, c)); });
  內容區.appendChild(鈕列);
  內容區.appendChild(列表區);
  顯示("全部");
}

// 活動：近期與過去活動列表，或單一活動（含報名表與成果）
function 活動頁() {
  const id = 網址參數.get("id");
  清空(內容區);
  if (id) {
    const a = 站.活動.find(function (x) { return x.id === id; });
    if (!a) { 內容區.appendChild(標題("找不到這個活動")); 內容區.appendChild(h("a", { href: "activities.html" }, "← 回活動列表")); return; }
    document.title = a.名稱 + "｜" + 站.協會.名稱;
    內容區.appendChild(h("p", null, h("a", { href: "activities.html" }, "← 回活動列表")));
    內容區.appendChild(標題(a.名稱));
    內容區.appendChild(h("div", { class: "卡" },
      h("p", null, h("strong", null, "時間："), 活動時間(a)),
      h("p", null, h("strong", null, "地點："), a.地點 || "另行通知"),
      h("p", null, h("strong", null, "名額："), a.名額 ? a.名額 + " 人（目前已報名 " + a.已報名數 + " 人" + (a.已報名數 >= a.名額 ? "，額滿後列候補" : "") + "）" : "不限"),
      h("p", null, h("strong", null, "費用："), a.費用 ? 金額(a.費用) + " 元" : "免費"),
      a.截止日 ? h("p", null, h("strong", null, "報名截止："), 民國(a.截止日)) : null,
      a.說明 ? 多行(a.說明) : null));
    if (可報名(a)) 內容區.appendChild(區段("我要報名", 報名表(a)));
    else if (a.日期 >= 今天()) 內容區.appendChild(h("p", { class: "標記 警" }, "報名已截止"));
    if (a.成果說明 || a.照片.length) {
      內容區.appendChild(區段("活動成果", h("div", null, a.成果說明 ? 多行(a.成果說明) : null,
        a.照片.length ? h("div", { class: "相片牆", style: "margin-top:1rem" }, a.照片.map(function (p) { return h("img", { src: p, alt: a.名稱 + " 活動照片", loading: "lazy" }); })) : null)));
    }
    return;
  }
  內容區.appendChild(標題("活動"));
  const 今 = 今天();
  const 近期 = 站.活動.filter(function (a) { return a.日期 >= 今; }).sort(function (a, b) { return 比較(a.日期, b.日期); });
  const 過去 = 站.活動.filter(function (a) { return a.日期 < 今; });
  內容區.appendChild(區段("近期活動", 近期.length ? h("div", { class: "格" }, 近期.map(活動卡)) : h("p", { class: "次要字" }, "目前沒有排定的活動")));
  內容區.appendChild(區段("過去活動與成果", 過去.length ? h("div", { class: "格" }, 過去.map(活動卡)) : h("p", { class: "次要字" }, "尚無")));
}

// 個資告知與同意（入會、報名共用）
function 個資告知(目的) {
  const id = "同意_" + 新編號();
  return h("div", { class: "欄 寬" },
    h("p", { class: "小字 次要字" }, "個人資料告知：本會僅為辦理「" + 目的 + "」蒐集、處理及利用您填寫的資料，不作其他用途；您可向本會查詢、更正或請求刪除。"),
    h("label", { for: id }, h("input", { type: "checkbox", id: id, "data-key": "同意" }), " 我已閱讀並同意上述個人資料告知"));
}

// 依欄位清單建立表單；回傳 {表單, 讀值()}
function 建立表單(欄們, 目的) {
  const 協 = 站.協會;
  const 表單 = h("form", { class: "表單", onsubmit: function (e) { e.preventDefault(); } });
  欄們.forEach(function (f) {
    const id = "欄_" + f.key;
    let 輸入;
    if (f.key === "服務機關") {
      輸入 = h("select", { id: id, "data-key": f.key }, h("option", { value: "" }, "請選擇"), 協.服務機關.map(function (o) { return h("option", { value: o }, o); }), h("option", { value: "其他" }, "其他"));
    } else if (f.多行) {
      輸入 = h("textarea", { id: id, "data-key": f.key, rows: 3 });
    } else {
      輸入 = h("input", { id: id, "data-key": f.key, type: f.型 || "text", autocomplete: f.自動 || "off" });
    }
    表單.appendChild(h("div", { class: "欄" + (f.多行 ? " 寬" : "") }, h("label", { for: id, class: f.必填 ? "必填" : "" }, f.標題), 輸入));
  });
  表單.appendChild(個資告知(目的));
  return {
    表單: 表單,
    讀值: function () {
      const 值 = {};
      表單.querySelectorAll("[data-key]").forEach(function (el) { 值[el.getAttribute("data-key")] = el.type === "checkbox" ? el.checked : el.value.trim(); });
      const 缺 = 欄們.filter(function (f) { return f.必填 && !值[f.key]; }).map(function (f) { return f.標題; });
      if (缺.length) return { 錯誤: "請填寫：" + 缺.join("、") };
      if (值.Email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(值.Email)) return { 錯誤: "Email 格式不正確" };
      if (!值.同意) return { 錯誤: "請勾選同意個人資料告知" };
      delete 值.同意;
      return { 值: 值 };
    }
  };
}

const 基本欄位 = [
  { key: "姓名", 標題: "姓名", 必填: true, 自動: "name" },
  { key: "員工編號", 標題: "員工編號" },
  { key: "服務機關", 標題: "服務機關", 必填: true },
  { key: "單位", 標題: "單位" },
  { key: "職稱", 標題: "職稱" },
  { key: "公務電話", 標題: "公務電話", 型: "tel" },
  { key: "Email", 標題: "Email", 必填: true, 型: "email", 自動: "email" },
  { key: "備註", 標題: "備註", 多行: true }
];

// 產生申請資料檔（JSON）並下載；檔案交給協會，由會務系統匯入
function 下載申請檔(類型, 值, 附加, 檔名) {
  const 內容 = Object.assign({ 格式: "協會申請資料", 格式版本: 1, 類型: 類型, 申請時間: new Date().toISOString(), 資料: 值 }, 附加 || {});
  下載檔案(檔名.replace(/[\\/:*?"<>|]/g, "_") + ".json", JSON.stringify(內容, null, 1), "application/json");
}

// 活動報名表
function 報名表(a) {
  const 表 = 建立表單(基本欄位, a.名稱 + " 活動報名");
  const 訊息 = h("div", { role: "status" });
  return h("div", { class: "卡" },
    h("p", null, "填寫後按「產生報名檔」，會下載一個報名資料檔，請以 Email 寄給協會" + (站.協會.Email ? "（" + 站.協會.Email + "）" : "") + "，協會登錄後即完成報名。"),
    表.表單,
    h("p", null, h("button", { class: "鈕 主", type: "button", id: "產生報名檔鈕", onclick: function () {
      const r = 表.讀值();
      清空(訊息);
      if (r.錯誤) return 訊息.appendChild(h("p", { class: "錯誤" }, r.錯誤));
      下載申請檔("活動報名", r.值, { 活動id: a.id, 活動名稱: a.名稱 }, "活動報名_" + a.名稱 + "_" + r.值.姓名);
      訊息.appendChild(h("p", { class: "完成訊息" }, "已產生報名資料檔，請寄給協會承辦人。名額依協會收件順序為準，額滿列候補。"));
    } }, "產生報名檔")),
    訊息);
}

// 會員福利：福利項目與特約商店
function 會員福利() {
  清空(內容區).appendChild(標題("會員福利"));
  內容區.appendChild(區段("福利項目", 站.福利.length ? h("div", { class: "格" }, 站.福利.map(function (b) {
    return h("div", { class: "卡" }, h("h3", null, b.名稱), b.對象 ? h("p", { class: "次要字" }, "對象：" + b.對象) : null, 多行(b.內容),
      b.申請方式 ? h("p", null, h("strong", null, "申請方式："), b.申請方式) : null);
  })) : h("p", { class: "次要字" }, "尚無資料")));
  const 類別們 = ["全部"].concat(Array.from(new Set(站.特約商店.map(function (s) { return s.類別; }).filter(Boolean))));
  const 列表 = h("div", { class: "格" });
  const 鈕列 = h("div", { class: "分類鈕", role: "group", "aria-label": "商店類別" });
  const 顯示 = function (類) {
    Array.from(鈕列.children).forEach(function (b) { b.setAttribute("aria-pressed", b.textContent === 類 ? "true" : "false"); });
    清空(列表);
    站.特約商店.filter(function (s) { return 類 === "全部" || s.類別 === 類; }).forEach(function (s) {
      列表.appendChild(h("div", { class: "卡" }, h("h3", null, s.名稱), s.類別 ? h("span", { class: "標記 金" }, s.類別) : null, 多行(s.優惠內容),
        h("p", { class: "小字 次要字" }, [s.地址, s.電話].filter(Boolean).join("　"))));
    });
  };
  類別們.forEach(function (c) { 鈕列.appendChild(h("button", { class: "鈕 小", type: "button", onclick: function () { 顯示(c); } }, c)); });
  內容區.appendChild(區段("特約商店", 站.特約商店.length ? h("div", null, 鈕列, 列表) : h("p", { class: "次要字" }, "尚無資料")));
  if (站.特約商店.length) 顯示("全部");
}

// 權益專區：建議與協商說明、成果、相關法規連結
function 權益專區() {
  清空(內容區).appendChild(標題("權益專區"));
  內容區.appendChild(h("div", { class: "格" },
    h("div", { class: "卡" }, h("h3", null, "建議事項（公務人員協會法第 6 條）"),
      h("p", null, "協會可就考試，公務人員之銓敘、保障、撫卹、退休，任免、考績、級俸、陞遷、褒獎等法制事項，公務人員權益相關事項，公務人員法規之制（訂）定、修正與廢止，以及工作簡化等事項，向有關機關提出建議。")),
    h("div", { class: "卡" }, h("h3", null, "協商事項（公務人員協會法第 7 條）"),
      h("p", null, "協會可就辦公環境之改善、行政管理、服勤之方式及起訖時間提出協商。"),
      h("p", { class: "小字 次要字" }, "不得協商：法律已有明文規定者；依法得提起申訴、復審、訴願、行政訴訟之事項；公務人員個人權益事項；與國防、安全、警政、獄政、消防及災害防救等有關之事項。"))));
  內容區.appendChild(h("p", { class: "小字 次要字" }, "以上為條文重點整理，正式條文以全國法規資料庫公布者為準。"));
  內容區.appendChild(區段("建議與協商成果", 站.權益成果.length ? h("div", { class: "格" }, 站.權益成果.map(function (r) {
    return h("div", { class: "卡" }, h("div", { class: "日期" }, 民國(r.日期) + (r.類型 ? "　" : "")), r.類型 ? h("span", { class: "標記 金" }, r.類型) : null,
      h("h3", null, r.標題), 多行(r.摘要), r.結果 ? h("p", null, h("strong", null, "辦理結果："), r.結果) : null);
  })) : h("p", { class: "次要字" }, "尚無資料")));
  if (站.法規連結.length) {
    內容區.appendChild(區段("相關法規", h("ul", null, 站.法規連結.map(function (l) {
      return h("li", null, h("a", { href: l.網址, rel: "noopener noreferrer", target: "_blank" }, l.名稱));
    }))));
  }
}

// 入會申請：說明、線上填寫 → 列印申請書＋下載申請資料檔
function 入會申請() {
  const 協 = 站.協會;
  清空(內容區).appendChild(標題("入會申請"));
  內容區.appendChild(h("div", { class: "卡" },
    h("p", null, "財政部及所屬機關的現職公務人員，認同本會宗旨者，歡迎加入。"),
    h("p", null, "入會費 " + 金額(協.入會費) + " 元；常年會費每年 " + 金額(協.常年會費) + " 元（依本會章程，經會員大會議決）。"),
    h("ol", null,
      h("li", null, "填寫下方表單。"),
      h("li", null, "按「列印申請書」，簽名後交給協會；或按「下載申請資料檔」，以 Email 寄給協會" + (協.Email ? "（" + 協.Email + "）" : "") + "。"),
      h("li", null, "協會審核通過後通知您繳交會費。"))));
  const 表 = 建立表單(基本欄位, "入會申請");
  const 訊息 = h("div", { role: "status" });
  const 取值 = function () {
    const r = 表.讀值();
    清空(訊息);
    if (r.錯誤) { 訊息.appendChild(h("p", { class: "錯誤" }, r.錯誤)); return null; }
    return r.值;
  };
  內容區.appendChild(區段("申請表", h("div", { class: "卡" }, 表.表單,
    h("p", null,
      h("button", { class: "鈕 主", type: "button", id: "列印申請書鈕", onclick: function () {
        const 值 = 取值();
        if (!值) return;
        列印申請書(值);
      } }, "列印申請書"), " ",
      h("button", { class: "鈕", type: "button", id: "下載申請檔鈕", onclick: function () {
        const 值 = 取值();
        if (!值) return;
        下載申請檔("入會申請", 值, null, "入會申請_" + 值.姓名);
        訊息.appendChild(h("p", { class: "完成訊息" }, "已產生入會申請資料檔，請寄給協會。"));
      } }, "下載申請資料檔")),
    訊息)));
}

// 把入會申請書放到列印區並列印（A4，標楷體）
function 列印申請書(值) {
  const 協 = 站.協會;
  const 區 = 清空(document.getElementById("列印區"));
  const 列 = function (名, v) { return h("tr", null, h("th", null, 名), h("td", null, v || "")); };
  區.appendChild(h("div", { class: "申請書" },
    h("h1", null, 協.名稱 + "　入會申請書"),
    h("table", null, h("tbody", null,
      列("姓名", 值.姓名), 列("員工編號", 值.員工編號), 列("服務機關", 值.服務機關), 列("單位", 值.單位), 列("職稱", 值.職稱),
      列("公務電話", 值.公務電話), 列("Email", 值.Email), 列("備註", 值.備註),
      列("申請日期", 民國(今天())), 列("申請人簽章", ""))),
    h("p", null, "本人認同本會宗旨，願遵守本會章程，申請入會。"),
    h("h3", null, "以下由協會填寫"),
    h("table", null, h("tbody", null, 列("收件日期", ""), 列("審核結果", "□ 核准　□ 不核准"), 列("會員編號", ""), 列("承辦人／秘書長／理事長", "")))));
  if (!navigator.webdriver) window.print();
}

// 下載專區：依分類列出檔案
function 下載專區() {
  清空(內容區).appendChild(標題("下載專區"));
  if (!站.下載.length) { 內容區.appendChild(h("p", { class: "次要字" }, "尚無資料")); return; }
  const 分類們 = Array.from(new Set(站.下載.map(function (d) { return d.分類 || "其他"; })));
  分類們.forEach(function (c) {
    內容區.appendChild(區段(c, h("ul", { class: "消息列" }, 站.下載.filter(function (d) { return (d.分類 || "其他") === c; }).map(function (d) {
      return h("li", null, d.檔案 ? h("a", { href: d.檔案, download: d.檔名 || null }, d.名稱) : h("span", null, d.名稱),
        h("span", { class: "次要字 小字" }, [d.說明, d.檔名].filter(Boolean).join("　")));
    }))));
  });
}

// 常見問答：可展開
function 常見問答() {
  清空(內容區).appendChild(標題("常見問答"));
  if (!站.常見問答.length) { 內容區.appendChild(h("p", { class: "次要字" }, "尚無資料")); return; }
  內容區.appendChild(h("div", null, 站.常見問答.map(function (q) {
    return h("details", { class: "問答" }, h("summary", null, q.問題), 多行(q.答案));
  })));
}

// 聯絡我們
function 聯絡我們() {
  const 協 = 站.協會;
  清空(內容區).appendChild(標題("聯絡我們"));
  const 列 = function (名, v, 連結) { return v ? h("p", null, h("strong", null, 名 + "："), 連結 ? h("a", { href: 連結 }, v) : v) : null; };
  內容區.appendChild(h("div", { class: "卡" },
    h("h2", null, 協.名稱),
    列("地址", 協.地址), 列("電話", 協.電話, 協.電話 ? "tel:" + 協.電話.replace(/[^\d+]/g, "") : null), 列("傳真", 協.傳真),
    列("Email", 協.Email, 協.Email ? "mailto:" + 協.Email : null), 列("服務時間", 協.服務時間)));
}

// 依頁面名稱畫出內容
function 顯示頁面() {
  if (!站 || 站.格式 !== "協會官網資料") {
    清空(內容區).appendChild(h("div", { class: "卡" }, h("h1", null, "找不到網站資料"),
      h("p", null, "請由會務管理系統「官網發布」產生 資料/site-data.js，並放在本網站的 資料 資料夾。")));
    return;
  }
  設定外框();
  const 表 = { 首頁: 首頁, 關於協會: 關於協會, 最新消息: 最新消息, 活動: 活動頁, 會員福利: 會員福利, 權益專區: 權益專區, 入會申請: 入會申請, 下載專區: 下載專區, 常見問答: 常見問答, 聯絡我們: 聯絡我們 };
  (表[本頁] || 首頁)();
}

設定按鈕();
顯示頁面();
