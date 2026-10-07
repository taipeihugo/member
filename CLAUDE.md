# 財政部公務人員協會：官網＋會務管理系統

## 使用者
hungtao。回覆一律用**繁體中文**，簡潔直接、少廢話。財政部所屬機關同仁。

## 兩台電腦（成品要能在這兩種環境跑）
| 名稱 | 說明 |
|------|------|
| 內網電腦 | 辦公室桌機，**無網路、無 Python／Node、受資安軟體控管** → 只能跑免安裝的東西：單一 HTML 用 Edge 以 file:// 直接開 |
| 同仁電腦 | 推廣對象，多半 8GB RAM、i5 第 8 代，Edge。效能以這個為準 |
| 我的筆電 | 可上網，開發用（Windows、Node、Edge） |

雲端工作階段是 Linux，可以用 Node／Chromium 建置與測試，但**成品本身不能依賴任何 runtime 或網路**。

## 規格
完整需求看 [README.md](README.md)。先做「第一階段」，做完一個模組就提交一次（commit＋push）。

## 寫程式的規則（內網工具一律遵守）
1. **單一 HTML、完全離線**：CSS／JS／圖示／字型全部內嵌，不從 CDN 載入，不連任何網址（`<meta http-equiv="Content-Security-Policy">` 把 `default-src` 鎖成 `'none'`，只開需要的 `'unsafe-inline'`、`data:`、`blob:`）。
2. 不用 `eval`、`new Function`、`document.write`、`insertAdjacentHTML`；動態 HTML 一律先經 `esc()` 跳脫，要插整段 HTML 用 `template.innerHTML` → `appendChild(template.content)`。
3. **不用 localStorage／sessionStorage／IndexedDB／cookie**。資料存成使用者自己選的檔案：Edge 以 file:// 開是 secure context，`showOpenFilePicker`／`showSaveFilePicker`／`showDirectoryPicker` 都能用；不支援時退回「下載檔案／選檔匯入」。關頁前有未存的變更要 `beforeunload` 提醒。
4. 下載用 Blob URL，**1.5 秒後撤銷**；匯出 CSV 加 BOM，並防公式注入（儲存格開頭是 `= + - @ \t \r` 時前面加 `'`）。
5. 讀 Excel／ODS／DOCX 用瀏覽器內建 `DecompressionStream("deflate-raw")` 自己解 zip，不引用外部函式庫；真的要用開源元件時，授權全文要隨程式內嵌並在「關於」視窗列出。
6. 程式**逐函式加中文註解**（每支函式前一行說明它做什麼），檔頭放「程式分節」目錄，讓不是工程師的同仁也看得懂。
7. 原始碼分多支 `.js`／`.css` 放 `製作/src/`，用 `製作/build.mjs` 依序接起來包成單一 HTML（整包外層 `(function(){"use strict"; … })()`，檢查內容不能出現 `</script`）。

## 命名與原創性
- 參考對象是某家廠商的公協會雲端套裝，但**介面、說明、註解、版本紀錄、測試都不可以出現該廠商或其產品名稱**，也不寫「仿 XX」。模組名稱一律用自訂的中文公務用語（見 README）。
- 範例資料（人名、電話、Email、身分證字號、金額）**全部虛構**，畫面上標「範例資料」。不用真實人名。

## 外觀
- 深藍 `#2a2854`＋金 `#c6951c`，深色／淺色切換。
- **不使用財政部部徽**（協會不是機關本身，未經授權不放）。自己畫一個簡單的協會會徽 `製作/src/logo.svg`（可替換），同時當網頁小圖示（data: URI）。
- 官網與會務系統共用同一套配色與會徽。

## 版本
- `製作/版本紀錄.md` 最上面的 `## v1.0` 就是目前版號，build 讀它寫進網頁（表頭、關於視窗、`<meta name="app-version">`）。
- **每次修改都升版號（v1.0→v1.1…，v1.9 之後是 v2.0）並保留上一版**：build 時如果發行檔是別的版本，先複製到 `v舊號/檔名_v舊號.html` 再覆蓋。不可以直接覆蓋掉舊版。

## 資料夾
```
官網/            發行：對外網站（靜態，多頁或單頁皆可）
會務系統/        發行：會務管理系統.html（單一檔）＋ 使用說明.md
製作/            原始碼、build.mjs、版本紀錄.md、test/（發給同仁時不附）
README.md       規格與說明
```
交付前清掉暫存檔。

## 測試
- `node 製作/build.mjs` 建置；`node 製作/build.mjs --test` 產生測試版（可注入 `window.__T` 測試掛勾）。
- 用無頭 Chromium（Playwright 或 Node 直接走 DevTools 協定皆可，測試相依套件只放在 `製作/`）以 **file://** 開成品，跑主要流程（新增會員、匯入、報名、記帳、簽核、出報表、存檔再開檔），收集主控台錯誤＝0，並截圖。
- 測試要檢查：整個 HTML 不含外部網址、不含禁用 API、不含參考廠商的產品名。
