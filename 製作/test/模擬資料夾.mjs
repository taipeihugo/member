// 測試用：在無頭瀏覽器裡模擬「選資料夾」功能，實際讀寫本機磁碟上的測試資料夾
// （瀏覽器的資料夾選擇視窗無法自動操作，所以用這個替身；只在測試時注入，成品程式不含）
import fs from "node:fs";
import path from "node:path";

// 在頁面上掛上檔案操作函式，並把 window.showDirectoryPicker 換成模擬版本
export async function 安裝模擬資料夾(page, 允許根目錄) {
  // 確認路徑在允許的測試資料夾內，避免測試誤寫其他地方
  const 檢查 = (p) => {
    const 絕對 = path.resolve(p);
    if (!絕對.startsWith(path.resolve(允許根目錄))) throw new Error("路徑超出測試資料夾：" + p);
    return 絕對;
  };
  await page.exposeFunction("__fs_stat", (p) => {
    p = 檢查(p);
    if (!fs.existsSync(p)) return { exists: false };
    const s = fs.statSync(p);
    return { exists: true, kind: s.isDirectory() ? "directory" : "file", size: s.size, mtime: Math.floor(s.mtimeMs) };
  });
  await page.exposeFunction("__fs_list", (p) => fs.readdirSync(檢查(p), { withFileTypes: true })
    .map((d) => ({ name: d.name, kind: d.isDirectory() ? "directory" : "file" })));
  await page.exposeFunction("__fs_read", (p) => fs.readFileSync(檢查(p)).toString("base64"));
  await page.exposeFunction("__fs_write", (p, b64) => {
    p = 檢查(p);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(b64, "base64"));
  });
  await page.exposeFunction("__fs_mkdir", (p) => { fs.mkdirSync(檢查(p), { recursive: true }); });
  await page.exposeFunction("__fs_remove", (p) => { fs.rmSync(檢查(p), { recursive: true, force: true }); });
  await page.addInitScript(() => {
    // 把 base64 轉成位元組
    const 轉位元組 = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
    // 位元組轉 base64
    const 轉base64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    const 找不到 = () => new DOMException("找不到", "NotFoundError");
    // 模擬檔案代號
    const 檔案 = (p, name) => ({
      kind: "file", name,
      async getFile() {
        const s = await window.__fs_stat(p);
        if (!s.exists) throw 找不到();
        return new File([轉位元組(await window.__fs_read(p))], name, { lastModified: s.mtime });
      },
      async createWritable() {
        const parts = [];
        return {
          async write(d) { parts.push(d && d.data !== undefined ? d.data : d); },
          async close() { await window.__fs_write(p, 轉base64(new Uint8Array(await new Blob(parts).arrayBuffer()))); }
        };
      }
    });
    // 模擬資料夾代號
    const 資料夾 = (p, name) => ({
      kind: "directory", name,
      async getFileHandle(n, o) {
        const q = p + "/" + n; const s = await window.__fs_stat(q);
        if (!s.exists) { if (!(o && o.create)) throw 找不到(); await window.__fs_write(q, ""); }
        else if (s.kind !== "file") throw new DOMException("型態不符", "TypeMismatchError");
        return 檔案(q, n);
      },
      async getDirectoryHandle(n, o) {
        const q = p + "/" + n; const s = await window.__fs_stat(q);
        if (!s.exists) { if (!(o && o.create)) throw 找不到(); await window.__fs_mkdir(q); }
        else if (s.kind !== "directory") throw new DOMException("型態不符", "TypeMismatchError");
        return 資料夾(q, n);
      },
      async removeEntry(n) { await window.__fs_remove(p + "/" + n); },
      async *entries() { for (const e of await window.__fs_list(p)) yield [e.name, e.kind === "file" ? 檔案(p + "/" + e.name, e.name) : 資料夾(p + "/" + e.name, e.name)]; },
      async *values() { for await (const [, v] of this.entries()) yield v; },
      async requestPermission() { return "granted"; },
      async queryPermission() { return "granted"; }
    });
    window.__模擬下一個資料夾 = null;
    window.showDirectoryPicker = async () => {
      const p = window.__模擬下一個資料夾;
      if (!p) throw new DOMException("使用者取消", "AbortError");
      return 資料夾(p, p.split("/").pop());
    };
  });
}

// 指定下一次「選資料夾」要回傳哪個資料夾
export async function 指定資料夾(page, 路徑) {
  await page.evaluate((p) => { window.__模擬下一個資料夾 = p; }, 路徑);
}
