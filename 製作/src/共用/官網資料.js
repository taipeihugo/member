// 檔案說明：把協會資料整理成「官網資料檔」（site-data.js）的內容；只放公開資訊，不含會員個資

// 從附件路徑取出官網上的檔案位置（附件/官網下載/abc_章程.pdf → 資料/檔案/abc_章程.pdf）
function 官網檔案位置(附件路徑) {
  const 檔名 = String(附件路徑 || "").split("/").pop();
  return 檔名 ? "資料/檔案/" + 檔名 : "";
}

// 依協會資料產生官網要用的資料物件（只挑「公開」的項目，依日期排序）
function 產生官網資料(資料, 發布時間) {
  const 設 = 資料.設定 || {};
  const 公開 = function (清單) { return (清單 || []).filter(function (x) { return x.公開 !== false; }); };
  const 依日期新到舊 = function (a, b) { return String(b.日期 || "").localeCompare(String(a.日期 || "")); };
  const 報名 = 資料.報名 || [];

  const 活動 = 公開(資料.活動).slice().sort(依日期新到舊).map(function (a) {
    const 正取數 = 報名.filter(function (r) { return r.活動id === a.id && r.狀態 === "正取"; }).length;
    const 成果公開 = a.成果公開 === true;
    return {
      id: a.id, 名稱: a.名稱, 類別: a.類別 || "", 日期: a.日期 || "", 開始時間: a.開始時間 || "", 結束時間: a.結束時間 || "",
      地點: a.地點 || "", 名額: Number(a.名額) || 0, 候補名額: Number(a.候補名額) || 0, 費用: Number(a.費用) || 0,
      截止日: a.截止日 || "", 說明: a.說明 || "", 已報名數: 正取數,
      成果說明: 成果公開 ? (a.成果說明 || "") : "",
      照片: 成果公開 ? (a.照片 || []).map(官網檔案位置) : []
    };
  });

  return {
    格式: "協會官網資料",
    格式版本: 1,
    發布時間: 發布時間 || "",
    範例資料: !!設.範例資料,
    協會: {
      名稱: 設.協會名稱 || "", 標語: 設.標語 || "", 宗旨: 設.宗旨 || "", 沿革: 設.沿革 || "", 章程: 設.章程 || "",
      地址: 設.地址 || "", 電話: 設.電話 || "", 傳真: 設.傳真 || "", Email: 設.Email || "", 服務時間: 設.服務時間 || "",
      組別: 設.組別 || [], 服務機關: 設.服務機關 || [],
      入會費: (設.會費標準 || {}).入會費 || 0, 常年會費: (設.會費標準 || {}).常年會費 || 0
    },
    理監事: (資料.理監事 || []).slice().sort(function (a, b) { return (Number(a.排序) || 0) - (Number(b.排序) || 0); })
      .map(function (p) { return { 職稱: p.職稱, 姓名: p.姓名, 服務機關: p.服務機關 || "" }; }),
    消息: 公開(資料.消息).slice().sort(function (a, b) {
      if (!!b.置頂 !== !!a.置頂) return b.置頂 ? 1 : -1;
      return 依日期新到舊(a, b);
    }).map(function (n) { return { id: n.id, 標題: n.標題, 分類: n.分類 || "", 日期: n.日期 || "", 內文: n.內文 || "", 置頂: !!n.置頂 }; }),
    活動: 活動,
    福利: 公開(資料.福利).map(function (b) { return { 名稱: b.名稱, 對象: b.對象 || "", 內容: b.內容 || "", 申請方式: b.申請方式 || "" }; }),
    特約商店: 公開(資料.特約商店).map(function (s) { return { 名稱: s.名稱, 類別: s.類別 || "", 優惠內容: s.優惠內容 || "", 地址: s.地址 || "", 電話: s.電話 || "" }; }),
    權益成果: 公開(資料.權益成果).slice().sort(依日期新到舊)
      .map(function (r) { return { 標題: r.標題, 類型: r.類型 || "", 日期: r.日期 || "", 摘要: r.摘要 || "", 結果: r.結果 || "" }; }),
    法規連結: (設.法規連結 || []).map(function (l) { return { 名稱: l.名稱, 網址: l.網址 }; }),
    下載: 公開(資料.下載).map(function (d) {
      return { 名稱: d.名稱, 分類: d.分類 || "", 說明: d.說明 || "", 檔案: 官網檔案位置(d.附件), 檔名: d.檔名 || "" };
    }),
    常見問答: 公開(資料.常見問答).slice().sort(function (a, b) { return (Number(a.排序) || 0) - (Number(b.排序) || 0); })
      .map(function (q) { return { 分類: q.分類 || "", 問題: q.問題, 答案: q.答案 }; })
  };
}

// 把官網資料物件轉成 site-data.js 的文字內容（JSON 內的 < 與換行分隔字元會跳脫，避免被誤判成標籤）
function 官網資料檔內容(官網資料) {
  const json = JSON.stringify(官網資料, null, 1)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return "/* 官網資料檔：由會務管理系統「發布到官網」產生，請勿手動修改 */\nwindow.SITE_DATA = " + json + ";\n";
}
