// 檔案說明：首頁（待辦簽核、待催繳會費、近期活動與會議、本月收支、會員數變化）

註冊頁面("首頁", {
  圖示: "⌂",
  說明: "首頁整理今天要注意的事：本年度還沒繳常年會費的人數、近期活動、本月收支、會員人數變化。點卡片可直接到對應功能。「待我簽核」與「會議」會在第二階段（公文與簽核、會議與決議）開放。",
  繪製: 繪製首頁
});

// 計算某一天時的有效會員數（已入會、尚未退會）
function 某日會員數(日期) {
  return 集合("會員").filter(function (m) {
    if (!m.入會日期 || m.入會日期 > 日期) return false;
    if (m.退會日期 && m.退會日期 <= 日期) return false;
    return m.會籍狀態 !== "申請中";
  }).length;
}

// 取得某月份（YYYY-MM）的最後一天
function 月底(年月) {
  const [y, m] = 年月.split("-").map(Number);
  return 年月 + "-" + 補零(new Date(y, m, 0).getDate());
}

// 畫出首頁
function 繪製首頁(容器) {
  const 設 = 狀態.資料.設定;
  const 今 = 今天();
  const 年 = 本年();
  const 本月 = 今.slice(0, 7);
  const 有效 = 集合("會員").filter(function (m) { return m.會籍狀態 === "有效"; });
  const 申請中 = 集合("會員").filter(function (m) { return m.會籍狀態 === "申請中"; });
  const 未繳 = 未繳名單(年);
  const 本月傳票 = 集合("傳票").filter(function (v) { return String(v.日期).slice(0, 7) === 本月; });
  const 本月收入 = 本月傳票.filter(function (v) { return v.收支 === "收入"; }).reduce(function (s, v) { return s + Number(v.金額 || 0); }, 0);
  const 本月支出 = 本月傳票.filter(function (v) { return v.收支 === "支出"; }).reduce(function (s, v) { return s + Number(v.金額 || 0); }, 0);
  const 近期 = 集合("活動").filter(function (a) { return a.日期 >= 今; }).sort(function (a, b) { return 比較(a.日期, b.日期); }).slice(0, 6);

  容器.appendChild(頁首("您好，" + 狀態.使用者.姓名, [h("span", { class: "次要字" }, 民國(今) + "　" + 狀態.使用者.角色)]));
  if (設.範例資料) 容器.appendChild(h("p", { class: "範例條" }, "目前開啟的是範例資料（人名、電話、Email、金額全部虛構），僅供練習"));

  // 數字卡（點了可以跳到對應功能）
  const 數字卡 = function (標, 數, 註, 去處, 參數) {
    return h("button", { type: "button", class: "卡 數字卡", style: "text-align:left;cursor:pointer;font:inherit;color:inherit", onclick: function () { 前往(去處, 參數); } },
      h("div", { class: "標" }, 標), h("div", { class: "數字" }, 數), h("div", { class: "小字 次要字" }, 註));
  };
  容器.appendChild(h("div", { class: "格" },
    數字卡("有效會員", 金額(有效.length) + " 人", 申請中.length ? "另有 " + 申請中.length + " 件入會申請待審" : "名冊管理", "會員名冊"),
    數字卡(民國年(年) + " 年度未繳常年會費", 未繳.length + " 人", "應收 " + 金額(未繳.length * (Number(設.會費標準.常年會費) || 0)) + " 元，前往催繳", "會費與帳務", { 頁籤: "催繳" }),
    數字卡("本月收入", 金額(本月收入) + " 元", "支出 " + 金額(本月支出) + " 元，結餘 " + 金額(本月收入 - 本月支出) + " 元", "會費與帳務", { 頁籤: "收支記帳" }),
    數字卡("近期活動", 近期.length + " 場", 近期[0] ? "最近：" + 近期[0].名稱 : "目前沒有排定的活動", "活動報名")));

  // 待我簽核、近期活動與會議
  const 活動清單 = h("ul", { class: "清單" }, 近期.length ? 近期.map(function (a) {
    const 正取 = 集合("報名").filter(function (r) { return r.活動id === a.id && r.狀態 === "正取"; }).length;
    return h("li", null, h("span", { class: "標記 金" }, 民國(a.日期)),
      h("a", { href: "#", onclick: function (e) { e.preventDefault(); 前往("活動報名", { 活動id: a.id }); } }, a.名稱),
      h("span", { class: "次要字 小字", style: "margin-left:auto" }, "報名 " + 正取 + "／" + (a.名額 || "不限")));
  }) : h("li", { class: "次要字" }, "目前沒有排定的活動"));

  // 會員數變化（近 12 個月）
  const 月份們 = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    月份們.push(d.getFullYear() + "-" + 補零(d.getMonth() + 1));
  }
  const 人數們 = 月份們.map(function (ym) { return 某日會員數(ym === 本月 ? 今 : 月底(ym)); });
  const 最大 = Math.max.apply(null, 人數們.concat([1]));
  const 最小 = Math.min.apply(null, 人數們);
  const 底 = Math.max(0, 最小 - Math.ceil((最大 - 最小) * 0.5) - 1);
  const 條圖 = h("div", { class: "條圖", role: "img", "aria-label": "近 12 個月會員人數" },
    月份們.map(function (ym, i) {
      const 高 = Math.round(((人數們[i] - 底) / (最大 - 底 || 1)) * 100);
      return h("div", { class: "柱", title: ym + "：" + 人數們[i] + " 人" },
        h("span", null, 人數們[i]), h("i", { style: "height:" + Math.max(2, 高) + "%" }), h("span", null, Number(ym.slice(5)) + "月"));
    }));
  const 入退 = 集合("會員異動").filter(function (x) { return String(x.日期).slice(0, 4) === String(年); });
  const 計 = function (類) { return 入退.filter(function (x) { return x.類型 === 類; }).length; };

  容器.appendChild(h("div", { class: "格2" },
    h("div", { class: "卡" }, h("h2", null, "待我簽核"),
      h("p", { class: "次要字" }, "公文與簽核模組將於第二階段開放；開放後，送到您這一關的公文會列在這裡。"),
      申請中.length && 可("會員.編輯") ? h("p", null, h("a", { href: "#", onclick: function (e) { e.preventDefault(); 前往("會員名冊", { 狀態: "申請中" }); } }, "有 " + 申請中.length + " 件入會申請待審核 →")) : null),
    h("div", { class: "卡" }, h("h2", null, "近期活動與會議"), 活動清單,
      h("p", { class: "次要字 小字" }, "會議（會員大會、理監事會）將於第二階段開放。")),
    h("div", { class: "卡" }, h("h2", null, "會員數變化（近 12 個月）"), 條圖,
      h("p", { class: "小字 次要字" }, 民國年(年) + " 年度：入會 " + 計("入會") + " 人、退會 " + 計("退會") + " 人、轉調 " + 計("轉調") + " 人")),
    h("div", { class: "卡" }, h("h2", null, "待催繳會費"),
      未繳.length ? h("ul", { class: "清單" }, 未繳.slice(0, 6).map(function (m) {
        return h("li", null, h("span", null, m.姓名), h("span", { class: "次要字 小字" }, m.服務機關 || ""));
      })) : h("p", { class: "次要字" }, "本年度常年會費已全部收齊"),
      未繳.length > 6 ? h("p", { class: "小字" }, "…等 " + 未繳.length + " 人") : null)));
}
