// 檔案說明：讀寫試算表（自己解 zip：用瀏覽器內建 DecompressionStream；讀 xlsx／ods／csv，寫 xlsx）

// 用瀏覽器內建的解壓縮功能，把 deflate-raw 壓縮的資料解開
async function 解壓縮(位元組) {
  const 串流 = new Blob([位元組]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(串流).arrayBuffer());
}

// 讀 zip 檔的目錄，回傳 {檔名: 取出函式}；取出函式回傳該檔的位元組
function 讀zip目錄(buf) {
  const 資料 = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 從檔尾往前找「中央目錄結尾」標記 0x06054b50
  let 結尾 = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (資料.getUint32(i, true) === 0x06054b50) { 結尾 = i; break; }
  }
  if (結尾 < 0) throw new Error("不是有效的 zip 檔（xlsx／ods 都是 zip 格式）");
  const 筆數 = 資料.getUint16(結尾 + 10, true);
  let 位置 = 資料.getUint32(結尾 + 16, true);
  const 目錄 = {};
  const 解碼 = new TextDecoder("utf-8");
  for (let n = 0; n < 筆數; n++) {
    if (資料.getUint32(位置, true) !== 0x02014b50) throw new Error("zip 目錄格式錯誤");
    const 方法 = 資料.getUint16(位置 + 10, true);
    const 壓縮大小 = 資料.getUint32(位置 + 20, true);
    const 名長 = 資料.getUint16(位置 + 28, true);
    const 額外長 = 資料.getUint16(位置 + 30, true);
    const 註解長 = 資料.getUint16(位置 + 32, true);
    const 本地位置 = 資料.getUint32(位置 + 42, true);
    const 名 = 解碼.decode(buf.subarray(位置 + 46, 位置 + 46 + 名長));
    目錄[名] = async function () {
      const 本地名長 = 資料.getUint16(本地位置 + 26, true);
      const 本地額外長 = 資料.getUint16(本地位置 + 28, true);
      const 起 = 本地位置 + 30 + 本地名長 + 本地額外長;
      const 內容 = buf.subarray(起, 起 + 壓縮大小);
      if (方法 === 0) return 內容;
      if (方法 === 8) return 解壓縮(內容);
      throw new Error("不支援的壓縮方式：" + 方法);
    };
    位置 += 46 + 名長 + 額外長 + 註解長;
  }
  return 目錄;
}

// 從 zip 目錄取出一個檔案並轉成文字
async function zip取文字(目錄, 名) {
  if (!目錄[名]) return null;
  return new TextDecoder("utf-8").decode(await 目錄[名]());
}

// 把 XML 文字解析成文件物件
function 解析XML(文字) {
  return new DOMParser().parseFromString(文字, "application/xml");
}

// 取得 XML 元素裡指定「本地名稱」的子孫元素（不管命名空間前綴）
function 找元素(節點, 本地名) {
  return Array.from(節點.getElementsByTagNameNS("*", 本地名));
}

// 把 Excel 欄位代號（A、B…AA）轉成從 0 起算的欄號
function 欄號(代號) {
  let n = 0;
  for (const c of 代號) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

// 讀 xlsx 的第一個工作表，回傳二維陣列（文字）
async function 讀xlsx(buf) {
  const 目錄 = 讀zip目錄(buf);
  const 共用字串 = [];
  const ss = await zip取文字(目錄, "xl/sharedStrings.xml");
  if (ss) {
    找元素(解析XML(ss), "si").forEach(function (si) {
      共用字串.push(找元素(si, "t").map(function (t) { return t.textContent; }).join(""));
    });
  }
  // 找第一個工作表的檔名（依 workbook.xml 與關聯檔）
  let 工作表檔 = "xl/worksheets/sheet1.xml";
  const wb = await zip取文字(目錄, "xl/workbook.xml");
  const rels = await zip取文字(目錄, "xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const 第一 = 找元素(解析XML(wb), "sheet")[0];
    const rid = 第一 && (第一.getAttribute("r:id") || 第一.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    const 關聯 = 找元素(解析XML(rels), "Relationship").find(function (r) { return r.getAttribute("Id") === rid; });
    if (關聯) {
      const t = 關聯.getAttribute("Target").replace(/^\//, "");
      工作表檔 = t.indexOf("xl/") === 0 ? t : "xl/" + t;
    }
  }
  const 表 = await zip取文字(目錄, 工作表檔);
  if (!表) throw new Error("xlsx 裡找不到工作表");
  const 結果 = [];
  找元素(解析XML(表), "row").forEach(function (列) {
    const r = [];
    找元素(列, "c").forEach(function (格) {
      const 參照 = (格.getAttribute("r") || "").replace(/\d+/g, "");
      const 位 = 參照 ? 欄號(參照) : r.length;
      const 型 = 格.getAttribute("t");
      let 值 = "";
      if (型 === "s") 值 = 共用字串[Number((找元素(格, "v")[0] || {}).textContent)] || "";
      else if (型 === "inlineStr") 值 = 找元素(格, "t").map(function (t) { return t.textContent; }).join("");
      else { const v = 找元素(格, "v")[0]; 值 = v ? v.textContent : ""; }
      while (r.length < 位) r.push("");
      r[位] = 值;
    });
    結果.push(r);
  });
  return 結果.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
}

// 讀 ods（OpenDocument 試算表）的第一個工作表，回傳二維陣列
async function 讀ods(buf) {
  const 目錄 = 讀zip目錄(buf);
  const 內容 = await zip取文字(目錄, "content.xml");
  if (!內容) throw new Error("ods 裡找不到 content.xml");
  const 表 = 找元素(解析XML(內容), "table")[0];
  if (!表) return [];
  const 結果 = [];
  const TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
  找元素(表, "table-row").forEach(function (列) {
    const 列重複 = Math.min(Number(列.getAttributeNS(TABLE, "number-rows-repeated")) || 1, 1000);
    const r = [];
    Array.from(列.children).forEach(function (格) {
      if (格.localName !== "table-cell" && 格.localName !== "covered-table-cell") return;
      const 重複 = Math.min(Number(格.getAttributeNS(TABLE, "number-columns-repeated")) || 1, 200);
      const 值 = 找元素(格, "p").map(function (p) { return p.textContent; }).join("\n");
      for (let i = 0; i < 重複; i++) r.push(值);
    });
    while (r.length && r[r.length - 1] === "") r.pop();
    if (r.length) for (let i = 0; i < 列重複; i++) 結果.push(r.slice());
  });
  return 結果;
}

// 依副檔名讀取試算表檔（xlsx、ods、csv），回傳二維陣列
async function 讀試算表(檔案) {
  const 名 = 檔案.name.toLowerCase();
  const buf = new Uint8Array(await 檔案.arrayBuffer());
  if (名.endsWith(".xlsx")) return 讀xlsx(buf);
  if (名.endsWith(".ods")) return 讀ods(buf);
  if (名.endsWith(".csv") || 名.endsWith(".txt")) {
    // 先試 UTF-8，有亂碼就改用 Big5（舊版 Excel 存的 CSV）
    let 文字 = new TextDecoder("utf-8").decode(buf);
    if (文字.indexOf("�") >= 0) 文字 = new TextDecoder("big5").decode(buf);
    return 解析CSV(文字);
  }
  if (名.endsWith(".xls")) throw new Error("舊版 .xls 格式不支援，請在 Excel 另存成 .xlsx 或 .csv");
  throw new Error("只支援 .xlsx、.ods、.csv 檔");
}

// ===== 寫 xlsx =====

// 計算 CRC32 檢查碼（zip 格式需要）
const CRC表 = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// 計算一段位元組的 CRC32
function crc32(位元組) {
  let c = 0xffffffff;
  for (let i = 0; i < 位元組.length; i++) c = CRC表[(c ^ 位元組[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 把多個檔案包成 zip（不壓縮，格式最單純），回傳 Uint8Array
function 打包zip(檔案們) {
  const 編碼 = new TextEncoder();
  const 本地段 = [];
  const 目錄段 = [];
  let 位移 = 0;
  檔案們.forEach(function (f) {
    const 名 = 編碼.encode(f.名);
    const 內容 = typeof f.內容 === "string" ? 編碼.encode(f.內容) : f.內容;
    const crc = crc32(內容);
    const 頭 = new DataView(new ArrayBuffer(30));
    頭.setUint32(0, 0x04034b50, true); 頭.setUint16(4, 20, true); 頭.setUint16(6, 0x0800, true);
    頭.setUint16(8, 0, true); 頭.setUint32(14, crc, true);
    頭.setUint32(18, 內容.length, true); 頭.setUint32(22, 內容.length, true); 頭.setUint16(26, 名.length, true);
    本地段.push(new Uint8Array(頭.buffer), 名, 內容);
    const 目 = new DataView(new ArrayBuffer(46));
    目.setUint32(0, 0x02014b50, true); 目.setUint16(4, 20, true); 目.setUint16(6, 20, true); 目.setUint16(8, 0x0800, true);
    目.setUint32(16, crc, true); 目.setUint32(20, 內容.length, true); 目.setUint32(24, 內容.length, true);
    目.setUint16(28, 名.length, true); 目.setUint32(42, 位移, true);
    目錄段.push(new Uint8Array(目.buffer), 名);
    位移 += 30 + 名.length + 內容.length;
  });
  const 目錄大小 = 目錄段.reduce(function (s, b) { return s + b.length; }, 0);
  const 尾 = new DataView(new ArrayBuffer(22));
  尾.setUint32(0, 0x06054b50, true); 尾.setUint16(8, 檔案們.length, true); 尾.setUint16(10, 檔案們.length, true);
  尾.setUint32(12, 目錄大小, true); 尾.setUint32(16, 位移, true);
  const 全部 = 本地段.concat(目錄段, [new Uint8Array(尾.buffer)]);
  const 結果 = new Uint8Array(全部.reduce(function (s, b) { return s + b.length; }, 0));
  let p = 0;
  全部.forEach(function (b) { 結果.set(b, p); p += b.length; });
  return 結果;
}

// XML 文字跳脫（並移除 XML 不允許的控制字元）
function xml跳脫(s) {
  return esc(String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""));
}

// 把二維陣列做成 xlsx 檔（第一列粗體當標題；數字存成數字，文字存成文字並防公式注入）
function 產生xlsx(列, 工作表名) {
  const 欄字 = function (i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const 列XML = 列.map(function (r, ri) {
    return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
      const 參照 = 欄字(ci) + (ri + 1);
      const 樣式 = ri === 0 ? ' s="1"' : "";
      if (typeof v === "number" && isFinite(v)) return '<c r="' + 參照 + '"' + 樣式 + "><v>" + v + "</v></c>";
      return '<c r="' + 參照 + '" t="inlineStr"' + 樣式 + "><is><t xml:space=\"preserve\">" + xml跳脫(防公式(v)) + "</t></is></c>";
    }).join("") + "</row>";
  }).join("");
  const 名 = xml跳脫(String(工作表名 || "工作表1").replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "工作表1");
  const 檔案們 = [
    { 名: "[Content_Types].xml", 內容: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { 名: "_rels/.rels", 內容: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { 名: "xl/workbook.xml", 內容: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + 名 + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { 名: "xl/_rels/workbook.xml.rels", 內容: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { 名: "xl/styles.xml", 內容: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><name val="Microsoft JhengHei"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' },
    { 名: "xl/worksheets/sheet1.xml", 內容: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + 列XML + "</sheetData></worksheet>" }
  ];
  return 打包zip(檔案們);
}

// 匯出二維陣列：格式 "csv" 或 "xlsx"
function 匯出表格(檔名, 列, 格式) {
  if (格式 === "xlsx") {
    下載檔案(檔名 + ".xlsx", new Blob([產生xlsx(列, 檔名)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  } else {
    下載檔案(檔名 + ".csv", 轉CSV(列), "text/csv;charset=utf-8");
  }
}
