// 建置程式：把 製作/src/ 的原始碼接成「會務管理系統.html」單一檔，並產生官網各頁
// 用法：node 製作/build.mjs          → 發行版（會務系統/、官網/）
//       node 製作/build.mjs --test   → 測試版（製作/test/output/，含 window.__T 測試掛勾）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const 根目錄 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const 原始碼 = path.join(根目錄, "製作", "src");
const 測試版 = process.argv.includes("--test");

// 讀取文字檔（UTF-8）
function 讀(相對路徑) {
  return fs.readFileSync(path.join(原始碼, 相對路徑), "utf8");
}

// 從 製作/版本紀錄.md 最上面的「## vX.Y」取得目前版號
function 讀版本() {
  const 內容 = fs.readFileSync(path.join(根目錄, "製作", "版本紀錄.md"), "utf8");
  const m = 內容.match(/^##\s*(v\d+\.\d+)\s*$/m);
  if (!m) throw new Error("版本紀錄.md 找不到「## v數字.數字」標題");
  return m[1];
}

// 把會徽 SVG 轉成 data: URI（網頁小圖示與表頭共用）
function 會徽網址() {
  const svg = 讀("logo.svg").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

// 列出某資料夾內的 .js 檔（依檔名排序），並讀出每支檔案第一行的「檔案說明」做程式分節目錄
function 收集程式(資料夾) {
  return fs.readdirSync(path.join(原始碼, 資料夾)).filter((f) => f.endsWith(".js")).sort()
    .map((f) => ({ 名稱: 資料夾 + "/" + f, 內容: 讀(資料夾 + "/" + f) }));
}

// 檢查程式內容：不能有 </script、不能用禁用的 API、不能出現參考廠商名稱
function 檢查內容(名稱, 內容, 允許網路) {
  const 錯誤 = [];
  if (/<\/script/i.test(內容)) 錯誤.push("含有 </script");
  const 禁用 = [
    [/\beval\s*\(/, "eval"], [/new\s+Function\s*\(/, "new Function"], [/document\.write/, "document.write"],
    [/insertAdjacentHTML/, "insertAdjacentHTML"], [/localStorage/, "localStorage"], [/sessionStorage/, "sessionStorage"],
    [/indexedDB/i, "indexedDB"], [/document\.cookie/, "document.cookie"], [允許網路 ? /(?!)/ : /\bfetch\s*\(/, "fetch"],
    [/XMLHttpRequest/, "XMLHttpRequest"], [/WebSocket/, "WebSocket"], [/\.outerHTML\s*=/, "outerHTML 指定"]
  ];
  for (const [規則, 名] of 禁用) if (規則.test(內容)) 錯誤.push("使用了禁用的 " + 名);
  if (/gsscloud|叡揚|\bgss\b/i.test(內容)) 錯誤.push("出現參考廠商名稱");
  if (錯誤.length) throw new Error(名稱 + "：" + 錯誤.join("、"));
}

// 產生程式分節目錄（放在程式最前面，讓同仁知道每段在做什麼）
function 程式分節(檔案們) {
  const 行 = ["/* ===== 程式分節 =====", " * （每一節對應 製作/src/ 裡的一支原始檔）"];
  檔案們.forEach((f, i) => {
    const 說明 = (f.內容.match(/^\/\/\s*檔案說明：(.*)$/m) || [, ""])[1];
    行.push(" * " + String(i + 1).padStart(2, "0") + ". " + f.名稱 + "：" + 說明);
  });
  行.push(" * ===================== */");
  return 行.join("\n");
}

// 把多支程式接成一段，整包包在 (function(){"use strict"; … })() 裡
function 接程式(檔案們, 開頭設定) {
  const 本體 = 檔案們.map((f) => "\n/* ---------- " + f.名稱 + " ---------- */\n" + f.內容).join("\n");
  return 程式分節(檔案們) + '\n(function () {\n"use strict";\n' + 開頭設定 + 本體 + "\n})();";
}

// 發行前保留舊版：發行檔若是別的版本，先複製到 v舊號/檔名_v舊號.html
function 保留舊版(發行檔, 新版號) {
  if (!fs.existsSync(發行檔)) return;
  const 舊內容 = fs.readFileSync(發行檔, "utf8");
  const m = 舊內容.match(/<meta name="app-version" content="(v\d+\.\d+)">/);
  if (!m || m[1] === 新版號) return;
  const 舊號 = m[1];
  const 目的資料夾 = path.join(path.dirname(發行檔), 舊號);
  fs.mkdirSync(目的資料夾, { recursive: true });
  const 目的 = path.join(目的資料夾, path.basename(發行檔, ".html") + "_" + 舊號 + ".html");
  if (!fs.existsSync(目的)) fs.copyFileSync(發行檔, 目的);
  console.log("已保留舊版：" + path.relative(根目錄, 目的));
}

// 寫出檔案（必要時建立資料夾）
function 寫出(檔案, 內容) {
  fs.mkdirSync(path.dirname(檔案), { recursive: true });
  fs.writeFileSync(檔案, 內容);
  console.log("已產生：" + path.relative(根目錄, 檔案) + "（" + Math.round(Buffer.byteLength(內容) / 1024) + " KB）");
}

// 套用版面樣板：把 {{名稱}} 換成對應內容
function 套版(樣板, 值) {
  return 樣板.replace(/\{\{([^}]+)\}\}/g, (全, 名) => {
    if (!(名 in 值)) throw new Error("樣板缺少值：" + 名);
    return 值[名];
  });
}

const 版本 = 讀版本();
const 會徽 = 會徽網址();
const 建置日期 = new Date().toISOString().slice(0, 10);
const 共用程式 = [
  { 名稱: "共用/工具.js", 內容: 讀("共用/工具.js") },
  { 名稱: "共用/官網資料.js", 內容: 讀("共用/官網資料.js") }
];
const 主題樣式 = 讀("共用/主題.css");

// ===== 會務管理系統（單一 HTML）=====
// 產生會務管理系統的單一 HTML
function 建置會務系統() {
  const 檔案們 = 共用程式.concat(收集程式("會務"));
  檔案們.forEach((f) => 檢查內容(f.名稱, f.內容));
  const 開頭設定 = "const 版本 = " + JSON.stringify(版本) + ";\nconst 建置日期 = " + JSON.stringify(建置日期) +
    ";\nconst 測試模式 = " + (測試版 ? "true" : "false") + ";\n";
  const 程式 = 接程式(檔案們, 開頭設定);
  const 樣式 = 主題樣式 + "\n" + 讀("會務/樣式.css");
  檢查內容("樣式", 樣式);
  const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; " +
    "font-src data:; connect-src 'none'; media-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
  const html = 套版(讀("會務/版面.html"), { CSP, 版本, 會徽, 樣式, 程式 });
  if (測試版) {
    寫出(path.join(根目錄, "製作", "test", "output", "會務管理系統_測試版.html"), html);
  } else {
    const 發行檔 = path.join(根目錄, "會務系統", "會務管理系統.html");
    保留舊版(發行檔, 版本);
    寫出(發行檔, html);
  }
}

// ===== 官網（多頁靜態網站）=====
const 官網頁面 = [
  { 檔: "index.html", 頁: "首頁", 標題: "首頁" },
  { 檔: "about.html", 頁: "關於協會", 標題: "關於協會" },
  { 檔: "news.html", 頁: "最新消息", 標題: "最新消息" },
  { 檔: "activities.html", 頁: "活動", 標題: "活動" },
  { 檔: "benefits.html", 頁: "會員福利", 標題: "會員福利" },
  { 檔: "rights.html", 頁: "權益專區", 標題: "權益專區" },
  { 檔: "join.html", 頁: "入會申請", 標題: "入會申請" },
  { 檔: "downloads.html", 頁: "下載專區", 標題: "下載專區" },
  { 檔: "faq.html", 頁: "常見問答", 標題: "常見問答" },
  { 檔: "contact.html", 頁: "聯絡我們", 標題: "聯絡我們" }
];

// 產生官網的每一頁（共用版面、樣式與程式，內容由 資料/site-data.js 決定）
function 建置官網() {
  if (!fs.existsSync(path.join(原始碼, "官網", "版面.html"))) return;
  const 程式檔 = 共用程式.concat(收集程式("官網"));
  程式檔.forEach((f) => 檢查內容(f.名稱, f.內容));
  const 程式 = 接程式(程式檔, "const 版本 = " + JSON.stringify(版本) + ";\n");
  const 樣式 = 主題樣式 + "\n" + 讀("官網/樣式.css");
  檢查內容("官網樣式", 樣式);
  const CSP = "default-src 'none'; script-src 'self' file: 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src 'self' file: data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const 樣板 = 讀("官網/版面.html");
  const 輸出資料夾 = 測試版 ? path.join(根目錄, "製作", "test", "output", "官網") : path.join(根目錄, "官網");
  for (const p of 官網頁面) {
    const 選單 = 官網頁面.map((q) =>
      '<a href="' + q.檔 + '"' + (q.檔 === p.檔 ? ' aria-current="page"' : "") + ">" + q.標題 + "</a>").join("\n        ") +
      '\n        <a href="portal/index.html" class="會員專區連結">會員專區</a>';
    const html = 套版(樣板, { CSP, 版本, 會徽, 樣式, 程式, 標題: p.標題, 頁: p.頁, 選單 });
    const 發行檔 = path.join(輸出資料夾, p.檔);
    if (!測試版) 保留舊版(發行檔, 版本);
    寫出(發行檔, html);
  }
  if (測試版) {
    // 測試版官網沿用發行版的資料檔
    const 來源 = path.join(根目錄, "官網", "資料");
    if (fs.existsSync(來源)) fs.cpSync(來源, path.join(輸出資料夾, "資料"), { recursive: true });
  }
}

// ===== 會員專區（線上系統，連 Supabase）=====
// 產生 官網/portal/index.html；連線設定.js 不存在時建立空白範本（已存在就不覆蓋）
function 建置線上系統() {
  const 程式檔 = 共用程式.concat(["會務/01_核心.js", "會務/02_試算表.js", "會務/05_資料表.js"].map((f) => ({ 名稱: f, 內容: 讀(f) })), 收集程式("線上"));
  程式檔.forEach((f) => 檢查內容(f.名稱, f.內容, true));
  const 開頭設定 = "const 版本 = " + JSON.stringify(版本) + ";\nconst 建置日期 = " + JSON.stringify(建置日期) +
    ";\nconst 測試模式 = " + (測試版 ? "true" : "false") + ";\n";
  const 程式 = 接程式(程式檔, 開頭設定);
  const 樣式 = 主題樣式 + "\n" + 讀("會務/樣式.css") + "\n" + 讀("線上/樣式.css");
  const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; " +
    "connect-src https://*.supabase.co; object-src 'none'; base-uri 'none'; form-action 'none'";
  const html = 套版(讀("線上/版面.html"), { CSP, 版本, 會徽, 樣式, 程式 });
  const 夾 = 測試版 ? path.join(根目錄, "製作", "test", "output", "官網", "portal") : path.join(根目錄, "官網", "portal");
  const 發行檔 = path.join(夾, "index.html");
  if (!測試版) 保留舊版(發行檔, 版本);
  寫出(發行檔, html);
  const 設定檔 = path.join(夾, "連線設定.js");
  if (!fs.existsSync(設定檔)) {
    寫出(設定檔, "/* 會員專區連線設定：填入 Supabase 專案網址與公開金鑰（publishable key，sb_publishable_ 開頭；舊版專案可用 anon key）。公開金鑰本身沒有讀取權限，資料由資料庫權限保護。Secret key（sb_secret_）與 service_role 金鑰絕對不能放在這裡。 */\n" +
      "window.PORTAL_CONFIG = {\n  url: \"\",\n  anonKey: \"\"\n};\n");
  }
}

建置會務系統();
建置官網();
建置線上系統();
console.log("建置完成：" + 版本 + (測試版 ? "（測試版）" : ""));
