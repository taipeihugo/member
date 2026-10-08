// 檔案說明：共用工具（HTML 跳脫、建立畫面元素、日期與民國年、金額、CSV、下載），官網與會務系統共用

// 把文字裡的 HTML 特殊字元換成安全寫法，避免資料被當成程式碼執行
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// 檢查網址是否安全（只允許 http、https、mailto、tel、圖片 data:、blob: 與相對路徑），不安全就回傳 "#"
function 安全網址(url) {
  const s = String(url == null ? "" : url).trim();
  if (/^(https?:|mailto:|tel:|blob:|data:image\/)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "#";
  return s;
}

// 建立一個畫面元素：h("div", {class:"x", onclick:函式}, "文字", 子元素…)；文字一律當純文字放入
function h(tag, attrs) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "selected" || k === "disabled" || k === "multiple") el[k] = !!v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "href" || k === "src") el.setAttribute(k, 安全網址(v));
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  加入子元素(el, Array.prototype.slice.call(arguments, 2));
  return el;
}

// 把子元素（文字、元素、陣列）依序加到父元素；文字會轉成純文字節點
function 加入子元素(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) { 加入子元素(el, k); continue; }
    el.appendChild(typeof k === "object" && k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}

// 清空一個元素裡的所有內容
function 清空(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// 用安全方式把一段（已跳脫的）HTML 字串轉成元素片段：template.innerHTML → content
function 轉片段(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
}

// 兩位數補零
function 補零(n, 位數) {
  return String(n).padStart(位數 || 2, "0");
}

// 取得今天日期（本機時間），格式 2026-10-07
function 今天() {
  const d = new Date();
  return d.getFullYear() + "-" + 補零(d.getMonth() + 1) + "-" + 補零(d.getDate());
}

// 取得現在時間（ISO 格式，含時區），用來記錄修改時間
function 現在() {
  return new Date().toISOString();
}

// 把 2026-10-07 這種日期轉成民國 115/10/07；空值回傳空字串
function 民國(日期) {
  if (!日期) return "";
  const m = String(日期).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(日期);
  return (Number(m[1]) - 1911) + "/" + m[2] + "/" + m[3];
}

// 把 ISO 時間轉成民國年月日＋時分，例：115/10/07 14:05
function 民國時間(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return (d.getFullYear() - 1911) + "/" + 補零(d.getMonth() + 1) + "/" + 補零(d.getDate()) + " " + 補零(d.getHours()) + ":" + 補零(d.getMinutes());
}

// 西元年轉民國年
function 民國年(西元年) {
  return Number(西元年) - 1911;
}

// 把民國日期（115/1/7、115.01.07、1150107）或西元日期轉成 2026-01-07；看不懂回傳空字串
function 解析日期(s) {
  s = String(s == null ? "" : s).trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return m[1] + "-" + 補零(m[2]) + "-" + 補零(m[3]);
  m = s.match(/^(\d{2,3})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return (Number(m[1]) + 1911) + "-" + 補零(m[2]) + "-" + 補零(m[3]);
  m = s.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (m) return (Number(m[1]) + 1911) + "-" + m[2] + "-" + m[3];
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel 日期序號（1900 日期系統）
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.getUTCFullYear() + "-" + 補零(d.getUTCMonth() + 1) + "-" + 補零(d.getUTCDate());
  }
  return "";
}

// 金額加千分位，例：12345 → 12,345
function 金額(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("en-US");
}

// 把金額轉成國字大寫（收據用），例：600 → 陸佰元整、10005 → 壹萬零伍元整
function 國字金額(n) {
  const 數 = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"];
  const 小單位 = ["", "拾", "佰", "仟"];
  const 大單位 = ["", "萬", "億", "兆"];
  let v = Math.round(Math.abs(Number(n) || 0));
  if (!v) return "零元整";
  const 各組 = [];
  while (v > 0) { 各組.push(v % 10000); v = Math.floor(v / 10000); }
  let 結果 = "";
  let 前面有字 = false;
  let 待補零 = false;
  for (let g = 各組.length - 1; g >= 0; g--) {
    const x = 各組[g];
    if (x === 0) { if (前面有字) 待補零 = true; continue; }
    if (前面有字 && x < 1000) 待補零 = true;
    let 段 = "";
    let 段補零 = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(x / Math.pow(10, i)) % 10;
      if (d === 0) { if (段) 段補零 = true; continue; }
      if (段補零) { 段 += "零"; 段補零 = false; }
      段 += 數[d] + 小單位[i];
    }
    結果 += (待補零 ? "零" : "") + 段 + 大單位[g];
    待補零 = false;
    前面有字 = true;
  }
  return 結果 + "元整";
}

// 產生一個不重複的編號（時間＋亂數）
function 新編號() {
  const 亂 = new Uint8Array(6);
  crypto.getRandomValues(亂);
  return Date.now().toString(36) + Array.from(亂, function (b) { return 補零(b.toString(16)); }).join("");
}

// 防公式注入：儲存格開頭是 = + - @ Tab 換行 時，前面加一個單引號
function 防公式(v) {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// 把二維陣列轉成 CSV 文字（含 BOM，Excel 開中文不亂碼；並防公式注入）
function 轉CSV(列) {
  const 行 = 列.map(function (r) {
    return r.map(function (v) {
      const s = 防公式(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  });
  return "﻿" + 行.join("\r\n") + "\r\n";
}

// 解析 CSV 文字成二維陣列（支援雙引號、欄內換行）
function 解析CSV(text) {
  text = String(text).replace(/^﻿/, "");
  const 列 = [];
  let 目前列 = [];
  let 欄 = "";
  let 引號中 = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (引號中) {
      if (c === '"') {
        if (text[i + 1] === '"') { 欄 += '"'; i++; } else 引號中 = false;
      } else 欄 += c;
    } else if (c === '"') 引號中 = true;
    else if (c === ",") { 目前列.push(欄); 欄 = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      目前列.push(欄); 欄 = "";
      列.push(目前列); 目前列 = [];
    } else 欄 += c;
  }
  if (欄 !== "" || 目前列.length) { 目前列.push(欄); 列.push(目前列); }
  return 列.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
}

// 下載檔案：用 Blob URL，1.5 秒後撤銷
function 下載檔案(檔名, 內容, 類型) {
  const blob = 內容 instanceof Blob ? 內容 : new Blob([內容], { type: 類型 || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = 檔名;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

// 比較兩個值做排序（數字比大小、文字依中文筆畫／字典順序）
function 比較(a, b) {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "zh-Hant-TW", { numeric: true });
}

// 深拷貝一個資料物件（只含 JSON 能表示的內容）
function 深拷貝(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}
