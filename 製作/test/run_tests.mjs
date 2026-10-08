// 無頭瀏覽器測試：以 file:// 開成品，跑主要流程、收集主控台錯誤（必須為 0）並截圖
// 用法：node 製作/build.mjs --test && node 製作/test/run_tests.mjs
// 截圖與暫存檔放在 製作/test/output/（不進版本控制）
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { 安裝模擬資料夾, 指定資料夾 } from "./模擬資料夾.mjs";

const 根目錄 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const 輸出 = path.join(根目錄, "製作", "test", "output");
const 截圖夾 = path.join(輸出, "截圖");
const 系統檔 = path.join(輸出, "會務管理系統_測試版.html");
const 官網夾 = path.join(輸出, "官網");
const 範例夾 = path.join(根目錄, "會務系統", "範例協會資料夾");

let 通過 = 0;
let 目前頁 = null;
const 失敗 = [];
const 主控台錯誤 = [];

// 記錄一項檢查結果
function 檢查(條件, 說明) {
  if (條件) { 通過++; console.log("  ✔ " + 說明); }
  else { 失敗.push(說明); console.log("  ✘ " + 說明); }
}

// 監聽頁面的主控台錯誤與未捕捉的例外
function 監聽錯誤(page, 名稱) {
  page.on("console", (m) => { if (m.type() === "error") 主控台錯誤.push(名稱 + "：" + m.text()); });
  page.on("pageerror", (e) => 主控台錯誤.push(名稱 + "：" + (e.stack || e.message)));
}

// 截圖
async function 截圖(page, 名稱, 全頁) {
  await page.screenshot({ path: path.join(截圖夾, 名稱 + ".png"), fullPage: !!全頁 });
}

// 讀資料夾裡的協會資料.json
function 讀資料(夾) {
  return JSON.parse(fs.readFileSync(path.join(夾, "協會資料.json"), "utf8"));
}

// 最上層（最後開啟）的對話框
function 對話框(page) {
  return page.locator("dialog[open]").last();
}

// 按最上層對話框裡的按鈕
async function 按對話框(page, 文字) {
  await 對話框(page).locator("button", { hasText: 文字 }).last().click();
}

// 在「列印」詢問視窗選字型，並等列印內容產生（測試版不會真的叫出印表機）
async function 選列印字型(page, 字型) {
  await page.evaluate(() => { window.__T.狀態.最後列印 = null; });
  await 按對話框(page, 字型);
  await page.waitForFunction(() => window.__T.狀態.最後列印);
}

// 點選左側選單
async function 選單(page, 名稱) {
  await page.locator("#側欄 button", { hasText: 名稱 }).first().click();
  await page.waitForTimeout(80);
}

// 點擊後等下載，存到輸出資料夾並回傳路徑
async function 等下載(page, 動作) {
  const [dl] = await Promise.all([page.waitForEvent("download"), 動作()]);
  const p = path.join(輸出, "下載", dl.suggestedFilename());
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await dl.saveAs(p);
  return p;
}

// 點擊後選檔
async function 選檔(page, 動作, 檔案們) {
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), 動作()]);
  await fc.setFiles(檔案們);
}

// 開啟會務系統並登入（資料夾模式）
async function 開系統並登入(context, 夾, 姓名標籤, 名稱) {
  const page = await context.newPage();
  監聽錯誤(page, 名稱);
  await 安裝模擬資料夾(page, 輸出);
  await page.goto("file://" + 系統檔);
  await 指定資料夾(page, 夾);
  await page.click("#選資料夾鈕");
  await page.waitForSelector("#登入姓名");
  await page.selectOption("#登入姓名", { label: 姓名標籤 });
  await page.fill("#登入密碼", "demo1234");
  await page.click("#登入鈕");
  await page.waitForSelector(".數字卡", { timeout: 20000 });
  目前頁 = page;
  return page;
}

// ===== 一、靜態檢查 =====
function 靜態檢查() {
  console.log("一、靜態檢查（外部網址、禁用 API、參考廠商名稱、CSP）");
  const 檔們 = [path.join(根目錄, "會務系統", "會務管理系統.html")].concat(
    fs.readdirSync(path.join(根目錄, "官網")).filter((f) => f.endsWith(".html")).map((f) => path.join(根目錄, "官網", f)));
  const 允許網域 = ["www.w3.org", "schemas.openxmlformats.org"];
  for (const f of 檔們) {
    const t = fs.readFileSync(f, "utf8");
    const 名 = path.relative(根目錄, f);
    // 絕對網址（http/https）與屬性裡的 //網域 寫法
    const 網址 = (t.match(/https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?:src|href)=["']\/\/[^"']+/gi) || []).filter((u) => !允許網域.some((d) => u.endsWith("//" + d)));
    檢查(網址.length === 0, 名 + " 不含外部網址" + (網址.length ? "（發現：" + 網址.slice(0, 3).join("、") + "）" : ""));
    const 禁用 = ["eval(", "new Function", "document.write", "insertAdjacentHTML", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "XMLHttpRequest", "fetch("]
      .filter((k) => t.includes(k));
    檢查(禁用.length === 0, 名 + " 不含禁用 API" + (禁用.length ? "（" + 禁用.join("、") + "）" : ""));
    檢查(!/gsscloud|叡揚|\bgss\b/i.test(t), 名 + " 不含參考廠商名稱");
    檢查(/<meta http-equiv="Content-Security-Policy" content="default-src 'none';/.test(t), 名 + " 有 CSP 且 default-src 'none'");
    const 腳本 = t.match(/<script>([\s\S]*)<\/script>/);
    檢查(腳本 && !/<\/script/i.test(腳本[1]), 名 + " 內嵌程式不含 </script");
  }
  const 系統 = fs.readFileSync(path.join(根目錄, "會務系統", "會務管理系統.html"), "utf8");
  檢查(/<meta name="app-version" content="v\d+\.\d+">/.test(系統), "會務系統含版本 meta");
  檢查(!/<script[^>]+src=/i.test(系統), "會務系統不載入外部 script");
}

// ===== 二、官網 =====
async function 官網測試(browser) {
  console.log("二、官網（file://，桌機與手機）");
  const 頁們 = ["index", "about", "news", "activities", "benefits", "rights", "join", "downloads", "faq", "contact"];
  for (const [裝置, 寬, 高] of [["桌機", 1280, 900], ["手機", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: 寬, height: 高 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    監聽錯誤(page, "官網" + 裝置);
    for (const p of 頁們) {
      await page.goto("file://" + path.join(官網夾, p + ".html"));
      await page.waitForTimeout(120);
      const 有內容 = await page.evaluate(() => document.getElementById("內容").innerText.trim().length > 20 && !/找不到網站資料/.test(document.body.innerText));
      檢查(有內容, 裝置 + " " + p + ".html 顯示內容");
      const 不橫捲 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      檢查(不橫捲, 裝置 + " " + p + ".html 沒有左右捲動");
      if (["index", "about", "activities", "join", "rights"].includes(p)) await 截圖(page, "官網_" + 裝置 + "_" + p, true);
    }
    if (裝置 === "手機") {
      await page.goto("file://" + path.join(官網夾, "index.html"));
      await page.click("#選單鈕");
      檢查(await page.isVisible("#主選單 a[href='faq.html']"), "手機版選單可展開");
      await 截圖(page, "官網_手機_選單展開");
    }
    await ctx.close();
  }
  // 消息內文、活動詳細與成果照片、入會申請、活動報名
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  監聽錯誤(page, "官網流程");
  await page.goto("file://" + path.join(官網夾, "news.html"));
  await page.locator(".消息列 a").first().click();
  await page.waitForSelector("article.卡");
  檢查((await page.locator("article.卡").innerText()).length > 10, "消息內文頁可開啟");
  await page.goto("file://" + path.join(官網夾, "activities.html"));
  await page.locator(".卡 h3 a", { hasText: "職場心理健康講座" }).click();
  await page.waitForSelector(".相片牆 img");
  const 照片載入 = await page.evaluate(() => Array.from(document.querySelectorAll(".相片牆 img")).every((i) => i.complete && i.naturalWidth > 0));
  檢查(照片載入, "活動成果照片可顯示（file://）");
  await 截圖(page, "官網_活動成果", true);
  // 入會申請：先測必填檢查，再填寫並下載申請資料檔
  await page.goto("file://" + path.join(官網夾, "join.html"));
  await page.click("#下載申請檔鈕");
  檢查(await page.isVisible(".錯誤"), "入會申請未填必填欄位會提示");
  await page.fill("#欄_姓名", "測試申請人");
  await page.selectOption("#欄_性別", "女");
  await page.fill("#欄_員工編號", "88001");
  await page.selectOption("#欄_服務機關", "財政部賦稅署");
  await page.fill("#欄_單位", "稅制組");
  await page.fill("#欄_職稱", "科員");
  await page.fill("#欄_Email", "applicant@example.org");
  await page.check("[data-key='同意']");
  const 申請檔 = await 等下載(page, () => page.click("#下載申請檔鈕"));
  const 申請 = JSON.parse(fs.readFileSync(申請檔, "utf8"));
  檢查(申請.類型 === "入會申請" && 申請.資料.姓名 === "測試申請人", "入會申請資料檔格式正確");
  await page.click("#列印申請書鈕");
  檢查((await page.locator("#列印區").innerText()).includes("入會申請書"), "可產生列印用入會申請書");
  // 活動報名（報名中的活動）
  await page.goto("file://" + path.join(官網夾, "activities.html"));
  await page.locator(".卡 h3 a", { hasText: "秋季淨灘志工服務" }).click();
  await page.fill("#欄_姓名", "官網報名者");
  await page.fill("#欄_員工編號", "88002");
  await page.selectOption("#欄_服務機關", "財政部關務署");
  await page.fill("#欄_Email", "signup@example.org");
  await page.check("[data-key='同意']");
  const 報名檔 = await 等下載(page, () => page.click("#產生報名檔鈕"));
  const 報名 = JSON.parse(fs.readFileSync(報名檔, "utf8"));
  檢查(報名.類型 === "活動報名" && 報名.活動名稱 === "秋季淨灘志工服務", "活動報名資料檔格式正確");
  await 截圖(page, "官網_活動報名", true);
  await ctx.close();
  return { 申請檔, 報名檔 };
}

// ===== 三、會務系統：新資料夾 =====
async function 新資料夾測試(browser) {
  console.log("三、會務系統：空資料夾建立協會資料");
  const 夾 = path.join(輸出, "新協會資料夾");
  fs.rmSync(夾, { recursive: true, force: true });
  fs.mkdirSync(夾, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  監聽錯誤(page, "新資料夾");
  await 安裝模擬資料夾(page, 輸出);
  await page.goto("file://" + 系統檔);
  await 截圖(page, "會務_開始畫面");
  await 指定資料夾(page, 夾);
  await page.click("#選資料夾鈕");
  await page.fill("[data-key='姓名']", "測試秘書長");
  await page.fill("[data-key='密碼']", "short");
  await page.fill("[data-key='再次']", "short");
  await page.click("#建立鈕");
  檢查((await page.locator(".錯誤").innerText()).includes("8 個字元"), "密碼太短會被擋下");
  await page.fill("[data-key='密碼']", "demo1234");
  await page.fill("[data-key='再次']", "demo1234");
  await page.click("#建立鈕");
  await page.waitForSelector(".數字卡");
  const d = 讀資料(夾);
  檢查(d.格式 === "協會資料" && d.使用者.length === 1 && /^[0-9a-f]{64}$/.test(d.使用者[0].雜湊), "建立協會資料.json，密碼以 PBKDF2 雜湊保存");
  檢查(!JSON.stringify(d).includes("demo1234"), "資料檔不含明文密碼");
  // 新增會員並存檔
  await 選單(page, "會員名冊");
  await page.click("#新增會員鈕");
  await 對話框(page).locator("[data-key='姓名']").fill("第一位會員");
  await 對話框(page).locator("[data-key='服務機關']").selectOption("財政部國庫署");
  await 按對話框(page, "儲存");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.getElementById("存檔狀態").textContent === "已存檔");
  const d2 = 讀資料(夾);
  檢查(d2.會員.length === 1 && d2.會員異動.length === 1 && d2.會員異動[0].類型 === "入會", "新增會員後存檔，並寫入入會異動");
  檢查(fs.readdirSync(path.join(夾, "備份")).length === 1, "第二次存檔前自動備份舊檔");
  await ctx.close();
}

// ===== 四、會務系統：範例資料主要流程 =====
async function 主要流程測試(browser, 官網檔) {
  console.log("四、會務系統：範例資料主要流程");
  const 夾 = path.join(輸出, "測試協會資料夾");
  fs.rmSync(夾, { recursive: true, force: true });
  fs.cpSync(範例夾, 夾, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await 開系統並登入(ctx, 夾, "陳怡君（秘書長）", "主要流程");
  await 截圖(page, "會務_首頁", true);
  檢查(await page.isVisible(".範例條"), "首頁標示範例資料");

  // --- 會員名冊 ---
  await 選單(page, "會員名冊");
  await 截圖(page, "會務_會員名冊");
  const 原人數 = 讀資料(夾).會員.length;
  // 用系統自己的 xlsx 產生器做一份測試檔（含 1 筆重複、1 筆新會員、1 筆公式開頭）
  const xlsx = await page.evaluate(() => Array.from(window.__T.產生xlsx([
    ["姓名", "員工編號", "機關", "科室", "職稱", "電話", "電子郵件", "入會日期"],
    ["林嘉文", "20007", "財政部（部本部）", "秘書處", "科員", "", "member001@example.org", "115/01/10"],
    ["匯入新會員", "77001", "國有財產署", "管理組", "專員", "(02)2000-0000 分機 9001", "import1@example.org", "115/09/01"],
    ["=公式測試", "77002", "財政部關務署", "稽查組", "科員", "", "import2@example.org", "2026-09-02"]
  ], "名冊")));
  const xlsx檔 = path.join(輸出, "匯入測試.xlsx");
  fs.writeFileSync(xlsx檔, Buffer.from(xlsx));
  await 選檔(page, () => page.click("#匯入會員鈕"), xlsx檔);
  await page.waitForSelector("dialog[open] #重複處理");
  await 截圖(page, "會務_匯入欄位對應");
  await 按對話框(page, "開始匯入");
  const 結果文字 = await 對話框(page).innerText();
  檢查(結果文字.includes("新增 2 人") && 結果文字.includes("略過重複 1 人"), "xlsx 匯入：欄位自動對應、重複比對（新增 2、略過 1）");
  await 按對話框(page, "關閉");
  // CSV 匯入（UTF-8，含引號與逗號）
  const csv檔 = path.join(輸出, "匯入測試.csv");
  fs.writeFileSync(csv檔, "﻿姓名,服務機關,單位,Email\n\"CSV,會員\",財政部財政資訊中心,系統開發組,csv1@example.org\n");
  await 選檔(page, () => page.click("#匯入會員鈕"), csv檔);
  await page.waitForSelector("dialog[open] #重複處理");
  await 按對話框(page, "開始匯入");
  await 按對話框(page, "關閉");
  // ODS 匯入（用最小的 OpenDocument 內容）
  const ods檔 = path.join(輸出, "匯入測試.ods");
  fs.writeFileSync(ods檔, 產生ods());
  await 選檔(page, () => page.click("#匯入會員鈕"), ods檔);
  await page.waitForSelector("dialog[open] #重複處理");
  await 按對話框(page, "開始匯入");
  await 按對話框(page, "關閉");
  // 標準格式名冊（姓名、女0男1、服務機關、服務單位、職稱、電子郵件信箱），含清單沒有的機關
  const 標準檔 = path.join(輸出, "標準格式名冊.xlsx");
  fs.writeFileSync(標準檔, Buffer.from(await page.evaluate(() => Array.from(window.__T.產生xlsx([
    ["姓名", "女0男1", "服務機關", "服務單位", "職稱", "電子郵件信箱"],
    ["標準格式甲", 0, "財政部賦稅署", "稅制組", "科員", "std1@example.org"],
    ["標準格式乙", 1, "財政部新設機關（測試）", "第一科", "專員", "std2@example.org"]
  ], "名冊")))));
  await 選檔(page, () => page.click("#匯入會員鈕"), 標準檔);
  await page.waitForSelector("dialog[open] #重複處理");
  await 按對話框(page, "開始匯入");
  const 標準結果 = await 對話框(page).innerText();
  檢查(標準結果.includes("新增 2 人") && 標準結果.includes("財政部新設機關（測試）"), "標準格式名冊匯入（欄位自動對應、新機關加入清單）");
  await 按對話框(page, "關閉");
  const 甲乙 = await page.evaluate(() => window.__T.狀態.資料.會員.filter((m) => m.姓名.startsWith("標準格式")).map((m) => m.性別 + m.單位 + m.Email));
  檢查(甲乙.join() === "女稅制組std1@example.org,男第一科std2@example.org", "女0男1 轉換正確、服務單位與電子郵件信箱對應正確");
  await page.fill(".表工具列 input[type=search]", "標準格式");
  await page.click("#匯出標準名冊鈕");
  const 標準出 = await 等下載(page, () => 按對話框(page, "CSV"));
  const 標準內容 = fs.readFileSync(標準出, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  檢查(標準內容[0] === "姓名,女0男1,服務機關,服務單位,職稱,電子郵件信箱" && 標準內容[1] === "標準格式甲,0,財政部賦稅署,稅制組,科員,std1@example.org", "匯出名冊（標準格式）欄位與內容正確");
  await page.fill(".表工具列 input[type=search]", "");
  const 範本 = await 等下載(page, () => page.click("#下載範本鈕"));
  檢查(fs.readFileSync(範本).subarray(0, 2).toString() === "PK", "可下載匯入範本（xlsx）");
  // 匯入官網入會申請 → 核准入會（同時收入會費）
  await 選檔(page, () => page.click("#匯入申請鈕"), 官網檔.申請檔);
  const 申請結果 = await 對話框(page).innerText();
  檢查(申請結果.includes("新增申請 1 件"), "匯入官網入會申請檔（申請中 1 件）" + (申請結果.includes("新增申請 1 件") ? "" : "：" + 申請結果));
  await 按對話框(page, "關閉");
  await page.fill(".表工具列 input[type=search]", "測試申請人");
  await page.locator("#內容 tbody tr").first().click();
  await 按對話框(page, "核准入會");
  await 按對話框(page, "儲存");
  // 轉調
  await page.fill(".表工具列 input[type=search]", "匯入新會員");
  await page.locator("#內容 tbody tr").first().click();
  await 截圖(page, "會務_會員詳細");
  await 按對話框(page, "辦理轉調");
  await 對話框(page).locator("[data-key='新機關']").selectOption("財政部北區國稅局");
  await 按對話框(page, "儲存");
  await page.fill(".表工具列 input[type=search]", "");
  // 匯出 CSV：檢查 BOM 與防公式注入
  const csv出 = await 等下載(page, () => page.locator(".表工具列 button", { hasText: "匯出 CSV" }).first().click());
  const csv內容 = fs.readFileSync(csv出, "utf8");
  檢查(csv內容.charCodeAt(0) === 0xfeff, "匯出 CSV 有 BOM");
  檢查(csv內容.includes("'=公式測試") && !/(^|,)=公式測試/m.test(csv內容), "匯出 CSV 防公式注入（= 開頭加單引號）");
  const xlsx出 = await 等下載(page, () => page.locator(".表工具列 button", { hasText: "匯出 Excel" }).first().click());
  檢查(fs.readFileSync(xlsx出).subarray(0, 2).toString() === "PK", "匯出 Excel（xlsx）檔案格式正確");
  // 再把匯出的 xlsx 讀回來，確認讀寫一致
  const 讀回 = await page.evaluate(async (b) => { const f = new File([new Uint8Array(b)], "x.xlsx"); return (await window.__T.讀試算表(f)).length; }, Array.from(fs.readFileSync(xlsx出)));
  檢查(讀回 > 100, "匯出的 xlsx 可再讀回（" + 讀回 + " 列）");
  // 分眾：勾選後複製 Outlook 收件者
  await page.locator("#內容 tbody .勾 input").nth(0).check();
  await page.locator("#內容 tbody .勾 input").nth(1).check();
  await page.locator(".批次列 button", { hasText: "複製 Outlook 收件者" }).click();
  檢查(/<[^>]+@example\.org>; /.test(await page.inputValue("#收件者字串")), "分眾名單：產生 Outlook 收件者字串");
  await 按對話框(page, "關閉");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.getElementById("存檔狀態").textContent === "已存檔");
  const d1 = 讀資料(夾);
  檢查(d1.會員.length === 原人數 + 7, "名冊匯入後人數正確（xlsx 2＋csv 1＋ods 1＋標準格式 2＋入會申請 1）");
  const 申請人 = d1.會員.find((m) => m.姓名 === "測試申請人");
  檢查(申請人 && 申請人.會籍狀態 === "有效" && d1.會費.some((f) => f.會員id === 申請人.id && f.項目 === "入會費"), "核准入會並登記入會費");
  const 轉調者 = d1.會員.find((m) => m.姓名 === "匯入新會員");
  檢查(轉調者.服務機關 === "財政部北區國稅局" && d1.會員異動.some((x) => x.會員id === 轉調者.id && x.類型 === "轉調"), "轉調寫入異動歷程");
  檢查(d1.會員.find((m) => m.姓名 === "匯入新會員").入會日期 === "2026-09-01", "民國日期（115/09/01）匯入轉換正確");

  // --- 會費與帳務 ---
  await 選單(page, "會費與帳務");
  await page.locator(".表工具列 select").nth(1).selectOption("未繳");
  const 未繳前 = await page.locator("#內容 tbody tr").count();
  await page.locator("#內容 tbody .勾 input").first().check();
  await page.locator(".批次列 button", { hasText: "登記繳費" }).click();
  await 對話框(page).locator("[data-key='列印']").check();
  await 按對話框(page, "儲存");
  await 選列印字型(page, "標楷體");
  const 收據文字 = await page.evaluate(() => window.__T.狀態.最後列印 || "");
  檢查(收據文字.includes("陸佰元整") && 收據文字.includes("收執聯") && 收據文字.includes("存根聯"), "登記繳費並列印收據（國字金額、兩聯）");
  檢查(await page.evaluate(() => document.getElementById("列印區").classList.contains("標楷")), "收據可選標楷體列印");
  await 截圖(page, "會務_會費收繳");
  await page.locator(".頁籤 button", { hasText: "催繳" }).click();
  const 催繳人數 = await page.locator("#內容 tbody tr").count();
  檢查(催繳人數 >= 1 && 催繳人數 <= 未繳前, "催繳名單列出未繳會員（" + 催繳人數 + "／" + 未繳前 + "）");
  await page.locator("#內容 thead .勾 input").check();
  await page.locator(".批次列 button", { hasText: "記錄已催繳" }).click();
  await 按對話框(page, "儲存");
  await page.locator("#內容 tbody .勾 input").first().check();
  await page.locator(".批次列 button", { hasText: "列印催繳通知單" }).click();
  await 選列印字型(page, "一般字型");
  檢查((await page.evaluate(() => window.__T.狀態.最後列印)).includes("常年會費繳納通知"), "列印催繳通知單");
  await 截圖(page, "會務_催繳");
  // 收支記帳：新增一筆支出
  await page.locator(".頁籤 button", { hasText: "收支記帳" }).click();
  await page.click("#新增傳票鈕");
  await 對話框(page).locator("[data-key='科目']").selectOption("5104");
  await 對話框(page).locator("[data-key='金額']").fill("1234");
  await 對話框(page).locator("[data-key='摘要']").fill("測試購買碳粉");
  await 按對話框(page, "儲存");
  await 截圖(page, "會務_收支記帳");
  // 收支決算表：合計要等於傳票加總
  await page.locator(".頁籤 button", { hasText: "收支決算表" }).click();
  await 截圖(page, "會務_收支決算表", true);
  const 表上 = await page.evaluate(() => {
    const 列 = Array.from(document.querySelectorAll("#決算表 tbody tr"));
    const 取 = (名) => { const r = 列.find((x) => x.cells[0].textContent.trim() === 名); return r ? Number(r.cells[1].textContent.replace(/,/g, "")) : NaN; };
    return { 收: 取("收入合計"), 支: 取("支出合計") };
  });
  const 傳票們 = await page.evaluate(() => window.__T.狀態.資料.傳票.filter((v) => v.日期.startsWith(String(new Date().getFullYear()))));
  const 算收 = 傳票們.filter((v) => v.收支 === "收入").reduce((s, v) => s + Number(v.金額), 0);
  const 算支 = 傳票們.filter((v) => v.收支 === "支出").reduce((s, v) => s + Number(v.金額), 0);
  檢查(表上.收 === 算收 && 表上.支 === 算支, "收支決算表合計＝傳票加總（收 " + 算收 + "、支 " + 算支 + "）");
  await page.click("#列印決算表鈕");
  await 選列印字型(page, "標楷體");
  檢查((await page.evaluate(() => window.__T.狀態.最後列印)).includes("收支決算表"), "收支決算表可列印");

  // --- 活動報名 ---
  await 選單(page, "活動報名");
  await 截圖(page, "會務_活動列表");
  await page.locator("#內容 tbody tr", { hasText: "秋季淨灘志工服務" }).click();
  await page.click("#加入會員報名鈕");
  await page.fill("#挑選搜尋", "第");
  await page.locator(".挑選清單 button").first().click().catch(() => {});
  await page.fill("#挑選搜尋", "");
  await page.locator(".挑選清單 button").first().click();
  await 按對話框(page, "完成");
  await 選檔(page, () => page.locator(".表工具列 button", { hasText: "匯入官網報名檔" }).click(), 官網檔.報名檔);
  檢查((await 對話框(page).innerText()).includes("正取 1 人"), "匯入官網報名檔（正取 1）");
  await 按對話框(page, "關閉");
  await 截圖(page, "會務_報名名單");
  await page.locator(".頁籤 button", { hasText: "簽到" }).click();
  await page.fill("#簽到輸入", "88002");
  await page.press("#簽到輸入", "Enter");
  檢查((await page.locator("[role=status]").first().innerText()).includes("簽到完成"), "輸入員工編號簽到");
  await page.locator("#內容 tbody input[type=checkbox]").nth(0).check();
  await 截圖(page, "會務_簽到");
  await page.locator(".頁籤 button", { hasText: "統計與通知" }).click();
  const 出席率 = await page.locator("#出席率").innerText();
  檢查(/%$/.test(出席率), "出席率統計（" + 出席率 + "）");
  await 截圖(page, "會務_活動統計", true);
  // 已結束活動：成果紀錄與照片
  await page.click("text=← 回活動列表");
  await page.locator("#內容 tbody tr", { hasText: "職場心理健康講座" }).click();
  await page.locator(".頁籤 button", { hasText: "成果紀錄" }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".相片牆 img")).some((i) => i.complete && i.naturalWidth > 0));
  檢查(true, "成果紀錄顯示附件照片（Blob URL）");
  await 截圖(page, "會務_成果紀錄");
  // 新增活動（名額 1、候補 1），測候補與遞補
  await page.click("text=← 回活動列表");
  await page.click("#新增活動鈕");
  await 對話框(page).locator("[data-key='名稱']").fill("候補測試活動");
  await 對話框(page).locator("[data-key='日期']").fill("2026-12-20");
  await 對話框(page).locator("[data-key='名額']").fill("1");
  await 對話框(page).locator("[data-key='候補名額']").fill("1");
  await 按對話框(page, "儲存");
  await page.click("#加入會員報名鈕");
  await page.locator(".挑選清單 button").nth(0).click();
  await page.locator(".挑選清單 button").nth(0).click();
  await page.locator(".挑選清單 button").nth(0).click();
  檢查((await 對話框(page).locator("[role=status]").innerText()).includes("額滿"), "名額與候補額滿時擋下");
  await 按對話框(page, "完成");
  const 狀們 = await page.locator("#內容 tbody tr td:nth-child(6)").allInnerTexts();
  檢查(狀們.join(",").includes("正取") && 狀們.join(",").includes("候補"), "超過名額自動列候補");
  await page.locator("#內容 tbody tr", { hasText: "正取" }).locator(".勾 input").check();
  await page.locator(".批次列 button", { hasText: "取消報名" }).click();
  await 按對話框(page, "取消報名");
  await page.locator("#內容 tbody tr", { hasText: "取消" }).first().waitFor();
  const 狀們2 = (await page.locator("#內容 tbody tr td:nth-child(6)").allInnerTexts()).join(",");
  檢查(狀們2.includes("取消") && 狀們2.includes("正取") && !狀們2.includes("候補"), "正取取消後候補自動遞補（" + 狀們2 + "）");

  // --- 官網發布 ---
  await 選單(page, "官網發布");
  await page.click("#新增官網項目鈕");
  await 對話框(page).locator("[data-key='標題']").fill("測試發布的新消息");
  await 對話框(page).locator("[data-key='內文']").fill("這是測試內容 <script>alert(1)</script>");
  await 按對話框(page, "儲存");
  await 截圖(page, "會務_官網發布");
  const 發布夾 = path.join(輸出, "發布測試官網");
  fs.rmSync(發布夾, { recursive: true, force: true });
  fs.cpSync(官網夾, 發布夾, { recursive: true });
  fs.rmSync(path.join(發布夾, "資料"), { recursive: true, force: true });
  await page.locator(".頁籤 button", { hasText: "發布" }).click();
  await 指定資料夾(page, 發布夾);
  await page.click("#發布鈕");
  await page.waitForFunction(() => /已發布/.test(document.getElementById("提示區").innerText), null, { timeout: 15000 });
  const 資料檔 = fs.readFileSync(path.join(發布夾, "資料", "site-data.js"), "utf8");
  檢查(資料檔.includes("測試發布的新消息") && !資料檔.includes("<script>"), "發布到官網：寫入 site-data.js 且 < 已跳脫");
  檢查(!資料檔.includes("member001@example.org"), "官網資料檔不含會員 Email");
  檢查(fs.readdirSync(path.join(發布夾, "資料", "檔案")).length >= 13, "發布時複製下載檔與公開照片");
  const 官網頁 = await ctx.newPage();
  監聽錯誤(官網頁, "發布後官網");
  await 官網頁.goto("file://" + path.join(發布夾, "news.html"));
  await 官網頁.locator(".消息列 a", { hasText: "測試發布的新消息" }).click();
  檢查((await 官網頁.locator("article").innerText()).includes("<script>alert(1)</script>"), "發布後官網顯示新消息（HTML 以純文字呈現）");
  await 官網頁.close();

  // --- 設定與操作紀錄 ---
  await 選單(page, "設定");
  await 截圖(page, "會務_設定");
  await 選單(page, "操作紀錄");
  檢查((await page.locator("#內容 tbody tr").count()) > 5, "操作紀錄有記錄");
  await 截圖(page, "會務_操作紀錄");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.getElementById("存檔狀態").textContent === "已存檔");

  // --- 多人同時存檔：合併與衝突 ---
  console.log("五、多人同時存檔：合併與衝突處理");
  const 基 = 讀資料(夾);
  const [A, B, C] = 基.會員.filter((m) => m.會籍狀態 === "有效").slice(10, 13);
  // 我（瀏覽器）改 A 職稱、B 備註
  await 選單(page, "會員名冊");
  for (const [人, 欄, 值] of [[A, "職稱", "我改的職稱"], [B, "備註", "我加的備註"]]) {
    await page.fill(".表工具列 input[type=search]", 人.會員編號);
    await page.locator("#內容 tbody tr").first().click();
    await 按對話框(page, "編輯資料");
    await 對話框(page).locator("[data-key='" + 欄 + "']").fill(值);
    await 按對話框(page, "儲存");
  }
  // 別人（直接改磁碟檔）同時改了 A 職稱與 C 單位
  await new Promise((r) => setTimeout(r, 30));
  const 他 = 讀資料(夾);
  const 時 = new Date().toISOString();
  Object.assign(他.會員.find((m) => m.id === A.id), { 職稱: "別人改的職稱", 修改時間: 時, 修改人: "另一位承辦人" });
  Object.assign(他.會員.find((m) => m.id === C.id), { 單位: "別人改的單位", 修改時間: 時, 修改人: "另一位承辦人" });
  fs.writeFileSync(path.join(夾, "協會資料.json"), JSON.stringify(他, null, 1));
  await page.click("#存檔鈕");
  await page.waitForSelector("dialog[open] .衝突");
  檢查((await page.locator("dialog[open] .衝突").count()) === 1, "同一筆兩邊都改 → 跳出衝突對照（1 筆）");
  await 截圖(page, "會務_衝突對照");
  await 對話框(page).locator("input[value='我的']").check();
  await 按對話框(page, "依選擇合併並存檔");
  await page.waitForFunction(() => document.getElementById("存檔狀態").textContent === "已存檔");
  const 合 = 讀資料(夾);
  檢查(合.會員.find((m) => m.id === A.id).職稱 === "我改的職稱", "衝突筆：依選擇保留我的版本");
  檢查(合.會員.find((m) => m.id === B.id).備註 === "我加的備註", "只有我改的筆：保留我的修改");
  檢查(合.會員.find((m) => m.id === C.id).單位 === "別人改的單位", "只有別人改的筆：保留別人的修改");

  // --- 備份份數 ---
  await page.evaluate(() => { window.__T.狀態.資料.設定.備份份數 = 5; });
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => { window.__T.狀態.未存 = true; });
    await page.evaluate(() => window.__T.存檔());
  }
  const 備份們 = fs.readdirSync(path.join(夾, "備份")).filter((f) => f.endsWith(".json"));
  檢查(備份們.length === 5, "自動備份只保留設定的份數（5）");
  await ctx.close();

  // --- 存檔再開檔 ---
  console.log("六、存檔後重新開啟");
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page2 = await 開系統並登入(ctx2, 夾, "陳怡君（秘書長）", "重新開啟");
  await 選單(page2, "會員名冊");
  await page2.fill(".表工具列 input[type=search]", "測試申請人");
  檢查((await page2.locator("#內容 tbody tr").count()) === 1, "重新開檔後資料仍在");
  await ctx2.close();

  // --- 一般會員角色（唯讀）---
  const ctx3 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page3 = await 開系統並登入(ctx3, 夾, "吳佩珊（一般會員）", "一般會員");
  const 選單項 = await page3.locator("#側欄 button").allInnerTexts();
  檢查(!選單項.join().includes("會員名冊") && !選單項.join().includes("設定"), "一般會員看不到名冊與設定（介面權限）");
  await ctx3.close();

  // --- 手機寬度 ---
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page4 = await 開系統並登入(ctx4, 夾, "陳怡君（秘書長）", "手機");
  await 截圖(page4, "會務_手機首頁");
  await ctx4.close();
}

// 用 Node 產生最小的 ODS 檔（zip，不壓縮）
function 產生ods() {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="a">' +
    "<table:table-row><table:table-cell><text:p>姓名</text:p></table:table-cell><table:table-cell><text:p>服務機關</text:p></table:table-cell></table:table-row>" +
    "<table:table-row><table:table-cell><text:p>ODS會員</text:p></table:table-cell><table:table-cell><text:p>財政部南區國稅局</text:p></table:table-cell></table:table-row>" +
    '<table:table-row table:number-rows-repeated="3"><table:table-cell table:number-columns-repeated="5"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';
  return 簡易zip([["mimetype", "application/vnd.oasis.opendocument.spreadsheet"], ["content.xml", xml]]);
}

// 簡易 zip 打包（不壓縮）
function 簡易zip(檔們) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const 本地 = [], 目錄 = [];
  let 位 = 0;
  for (const [名, 文] of 檔們) {
    const n = Buffer.from(名), d = Buffer.from(文);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt32LE(crc(d), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    本地.push(h, n, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc(d), 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(位, 42);
    目錄.push(c, n);
    位 += 30 + n.length + d.length;
  }
  const 目錄長 = 目錄.reduce((s, b) => s + b.length, 0);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(檔們.length, 8); e.writeUInt16LE(檔們.length, 10); e.writeUInt32LE(目錄長, 12); e.writeUInt32LE(位, 16);
  return Buffer.concat([...本地, ...目錄, e]);
}

// ===== 七、單檔模式（瀏覽器不支援選資料夾）=====
async function 單檔模式測試(browser) {
  console.log("七、單檔模式（不支援資料夾功能時）");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  監聽錯誤(page, "單檔模式");
  await page.addInitScript(() => { delete window.showDirectoryPicker; });
  await page.goto("file://" + 系統檔);
  檢查(await page.isVisible("text=開始使用（單檔模式）"), "不支援資料夾時顯示單檔模式");
  await 選檔(page, () => page.locator("button", { hasText: "開啟資料檔" }).click(), path.join(範例夾, "協會資料.json"));
  await page.selectOption("#登入姓名", { label: "黃志明（會計）" });
  await page.fill("#登入密碼", "demo1234");
  await page.click("#登入鈕");
  await page.waitForSelector(".數字卡");
  const 檔 = await 等下載(page, () => page.click("#存檔鈕"));
  檢查(JSON.parse(fs.readFileSync(檔, "utf8")).格式 === "協會資料", "單檔模式存檔＝下載資料檔");
  await ctx.close();
}

// ===== 執行 =====
fs.rmSync(截圖夾, { recursive: true, force: true });
fs.mkdirSync(截圖夾, { recursive: true });
fs.rmSync(path.join(輸出, "下載"), { recursive: true, force: true });
// 瀏覽器要用 UTF-8 語系，中文檔名的上傳與下載才正常（Linux 容器預設沒有設定語系）
const browser = await chromium.launch({ env: Object.assign({}, process.env, { LANG: "C.UTF-8", LC_ALL: "C.UTF-8" }) });
try {
  靜態檢查();
  const 官網檔 = await 官網測試(browser);
  await 新資料夾測試(browser);
  await 主要流程測試(browser, 官網檔);
  await 單檔模式測試(browser);
} catch (e) {
  失敗.push("測試中斷：" + (e.stack || e.message));
  console.error(e);
  if (目前頁) await 目前頁.screenshot({ path: path.join(截圖夾, "失敗當下.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
console.log("\n主控台錯誤：" + 主控台錯誤.length);
主控台錯誤.forEach((e) => console.log("  " + e));
檢查(主控台錯誤.length === 0, "主控台錯誤＝0");
console.log("\n通過 " + 通過 + " 項，失敗 " + 失敗.length + " 項");
失敗.forEach((f) => console.log("  ✘ " + f));
console.log("截圖：" + path.relative(根目錄, 截圖夾));
process.exit(失敗.length ? 1 : 0);
