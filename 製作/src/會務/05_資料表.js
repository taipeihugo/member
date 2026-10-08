// 檔案說明：通用資料表元件（排序、篩選、搜尋、分頁、勾選批次動作、匯出 CSV／Excel）

// 建立資料表。設定：
//   欄位：[{key, 標題, 值(r), 顯示(r)→文字或元素, 數字:bool, 不排序:bool, 不匯出:bool}]
//   資料()：回傳要顯示的紀錄陣列
//   篩選：[{標題, 選項()→陣列, 取值(r)→值或值陣列}]
//   批次：[{文字, 動作(已選紀錄們)}]（有設定才顯示勾選欄）
//   點列(r)、工具(額外按鈕陣列)、匯出檔名、每頁（預設 20）、預設排序 {key, 反向}
function 資料表(設定) {
  const 狀 = { 搜尋: "", 篩選: {}, 排序: 設定.預設排序 ? 設定.預設排序.key : null, 反向: 設定.預設排序 ? !!設定.預設排序.反向 : false, 頁: 0, 已選: new Set() };
  const 每頁 = 設定.每頁 || 20;
  const 外框 = h("div", { class: "資料表" });
  const 搜尋框 = h("input", { type: "search", placeholder: "搜尋…", "aria-label": "搜尋", oninput: function () { 狀.搜尋 = 搜尋框.value.trim(); 狀.頁 = 0; 繪製(); } });
  const 篩選們 = (設定.篩選 || []).map(function (f, i) {
    const 選 = h("select", { "aria-label": f.標題, onchange: function () { 狀.篩選[i] = 選.value; 狀.頁 = 0; 繪製(); } },
      h("option", { value: "" }, "全部" + f.標題));
    選.addEventListener("focus", function () { 填篩選選項(選, f, i); });
    填篩選選項(選, f, i);
    return 選;
  });
  const 匯出名 = 設定.匯出檔名 || "匯出";
  const 工具列 = h("div", { class: "表工具列" }, 搜尋框, 篩選們,
    h("div", { class: "右側" }, 設定.工具 || [],
      設定.不匯出 ? null : h("button", { class: "鈕 小", type: "button", onclick: function () { 匯出(false, "csv"); } }, "匯出 CSV"),
      設定.不匯出 ? null : h("button", { class: "鈕 小", type: "button", onclick: function () { 匯出(false, "xlsx"); } }, "匯出 Excel")));
  const 批次列 = h("div", { class: "批次列 隱藏" });
  const 表區 = h("div", { class: "表捲" });
  const 分頁列 = h("div", { class: "分頁列" });
  外框.appendChild(工具列);
  外框.appendChild(批次列);
  外框.appendChild(表區);
  外框.appendChild(分頁列);

  // 填入篩選下拉選單的選項（保留目前選擇）
  function 填篩選選項(選, f, i) {
    const 目前 = 狀.篩選[i] || "";
    while (選.options.length > 1) 選.remove(1);
    (typeof f.選項 === "function" ? f.選項() : f.選項).forEach(function (o) { 選.appendChild(h("option", { value: o, selected: o === 目前 }, o)); });
  }

  // 取欄位的原始值（排序、匯出、搜尋用）
  function 原值(欄, r) {
    return 欄.值 ? 欄.值(r) : r[欄.key];
  }

  // 依搜尋與篩選條件過濾，再排序
  function 目前資料() {
    let 列 = 設定.資料().slice();
    if (狀.搜尋) {
      const 字 = 狀.搜尋.toLowerCase();
      列 = 列.filter(function (r) {
        return 設定.欄位.some(function (欄) { return String(顯示值(原值(欄, r))).toLowerCase().indexOf(字) >= 0; });
      });
    }
    (設定.篩選 || []).forEach(function (f, i) {
      const v = 狀.篩選[i];
      if (!v) return;
      列 = 列.filter(function (r) { const x = f.取值(r); return Array.isArray(x) ? x.indexOf(v) >= 0 : String(x) === v; });
    });
    if (狀.排序) {
      const 欄 = 設定.欄位.find(function (c) { return c.key === 狀.排序; });
      if (欄) 列.sort(function (a, b) { const c = 比較(原值(欄, a), 原值(欄, b)); return 狀.反向 ? -c : c; });
    }
    return 列;
  }

  // 重新畫出表格
  function 繪製() {
    const 列 = 目前資料();
    const 頁數 = Math.max(1, Math.ceil(列.length / 每頁));
    if (狀.頁 >= 頁數) 狀.頁 = 頁數 - 1;
    const 本頁 = 列.slice(狀.頁 * 每頁, 狀.頁 * 每頁 + 每頁);
    // 已選的只保留目前篩選結果裡看得到的（避免勾了看不到的資料還被批次處理）
    const 存在 = new Set(列.map(function (r) { return r.id; }));
    狀.已選.forEach(function (id) { if (!存在.has(id)) 狀.已選.delete(id); });
    const 有勾選 = !!(設定.批次 && 設定.批次.length);
    const 全選 = h("input", { type: "checkbox", "aria-label": "全選本頁", checked: 本頁.length > 0 && 本頁.every(function (r) { return 狀.已選.has(r.id); }),
      onchange: function () { 本頁.forEach(function (r) { if (全選.checked) 狀.已選.add(r.id); else 狀.已選.delete(r.id); }); 繪製(); } });
    const 表頭 = h("tr", null, 有勾選 ? h("th", { class: "勾" }, 全選) : null,
      設定.欄位.map(function (欄) {
        const 可排 = !欄.不排序;
        return h("th", {
          class: (可排 ? "可排序" : "") + (欄.數字 ? " 數" : ""),
          "aria-sort": 狀.排序 === 欄.key ? (狀.反向 ? "descending" : "ascending") : null,
          onclick: 可排 ? function () { if (狀.排序 === 欄.key) 狀.反向 = !狀.反向; else { 狀.排序 = 欄.key; 狀.反向 = false; } 繪製(); } : null
        }, 欄.標題);
      }));
    const 身 = h("tbody", null, 本頁.map(function (r) {
      const 勾 = 有勾選 ? h("td", { class: "勾", onclick: function (e) { e.stopPropagation(); } },
        h("input", { type: "checkbox", "aria-label": "勾選", checked: 狀.已選.has(r.id), onchange: function (e) { if (e.target.checked) 狀.已選.add(r.id); else 狀.已選.delete(r.id); 繪製(); } })) : null;
      return h("tr", { class: (設定.點列 ? "可點" : "") + (狀.已選.has(r.id) ? " 已選" : ""), dataset: { id: r.id }, onclick: 設定.點列 ? function () { 設定.點列(r); } : null },
        勾, 設定.欄位.map(function (欄) {
          const v = 欄.顯示 ? 欄.顯示(r) : 顯示值(原值(欄, r));
          return h("td", { class: 欄.數字 ? "數" : "" }, v);
        }));
    }));
    清空(表區).appendChild(h("table", { class: "表" }, h("thead", null, 表頭), 身));
    if (!列.length) 表區.appendChild(h("div", { class: "空" }, 設定.空白文字 || "沒有資料"));
    // 批次動作列
    清空(批次列);
    批次列.classList.toggle("隱藏", !(有勾選 && 狀.已選.size));
    if (有勾選 && 狀.已選.size) {
      批次列.appendChild(h("strong", null, "已勾選 " + 狀.已選.size + " 筆"));
      設定.批次.forEach(function (b) {
        批次列.appendChild(h("button", { class: "鈕 小", type: "button", onclick: function () { b.動作(已選紀錄()); } }, b.文字));
      });
      批次列.appendChild(h("button", { class: "鈕 小", type: "button", onclick: function () { 匯出(true, "csv"); } }, "匯出勾選"));
      批次列.appendChild(h("button", { class: "鈕 小 文字", type: "button", onclick: function () { 狀.已選.clear(); 繪製(); } }, "取消勾選"));
    }
    // 分頁
    清空(分頁列);
    分頁列.appendChild(h("span", { class: "次要字 小字" }, "共 " + 列.length + " 筆"));
    if (頁數 > 1) {
      分頁列.appendChild(h("button", { class: "鈕 小", type: "button", disabled: 狀.頁 === 0, onclick: function () { 狀.頁--; 繪製(); } }, "上一頁"));
      分頁列.appendChild(h("span", null, "第 " + (狀.頁 + 1) + " / " + 頁數 + " 頁"));
      分頁列.appendChild(h("button", { class: "鈕 小", type: "button", disabled: 狀.頁 >= 頁數 - 1, onclick: function () { 狀.頁++; 繪製(); } }, "下一頁"));
    }
  }

  // 取得目前勾選的紀錄（依目前排序）
  function 已選紀錄() {
    return 目前資料().filter(function (r) { return 狀.已選.has(r.id); });
  }

  // 匯出目前篩選結果（或只匯出勾選的）
  function 匯出(只勾選, 格式) {
    const 列 = 只勾選 ? 已選紀錄() : 目前資料();
    const 欄們 = 設定.欄位.filter(function (c) { return !c.不匯出; });
    const 表 = [欄們.map(function (c) { return c.標題; })].concat(列.map(function (r) {
      return 欄們.map(function (c) { const v = 原值(c, r); return typeof v === "number" ? v : 顯示值(v); });
    }));
    匯出表格(匯出名 + "_" + 今天(), 表, 格式);
  }

  繪製();
  return { 元素: 外框, 重繪: 繪製, 已選: 已選紀錄, 目前: 目前資料, 清除勾選: function () { 狀.已選.clear(); 繪製(); } };
}
