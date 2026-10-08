// 會員專區「匯入名冊」比對規則的單元測試：直接執行原始碼裡的 匯入線上名冊（讀檔、對話框、資料庫都用假的）
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
const 原始碼 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "線上");
const src = fs.readFileSync(path.join(原始碼, "20_幹部.js"), "utf8");
const conn = fs.readFileSync(path.join(原始碼, "01_連線.js"), "utf8");
// 從原始碼切出 a 到 b 之間的程式
const g = (t, a, b) => { const i = t.indexOf(a); if (i < 0) throw a; return t.slice(i, t.indexOf(b, i)); };
const code = [g(src,"const 線上匯入別名","// 把名冊裡的理監事"),g(src,"function 轉理監事","// 兩個值是否不衝突"),g(src,"function 不衝突","// 匯入名冊："),g(src,"async function 匯入線上名冊","// ===== 認領碼"),g(conn,"function 暫時錯誤","// 實際送出")].join("\n");
let 通過 = 0, 失敗 = 0;
const 檢查 = (c, m) => { if (c) 通過++; else 失敗++; console.log((c ? "  ✔ " : "  ✘ ") + m); };
// 用指定的名冊與試算表內容執行一次匯入，回傳預覽文字、新增與修改的資料、匯入後的名冊
async function run(roster, rows) {
  const db = roster.map(m=>({ email: "", employee_no: "", ...m })); let nid = 0; const out = { patches: [], inserts: [], dlg: [] };
  const ctx = { console, 連線: { 帳號: { id: "me" } }, 選擇檔案: async()=>[{name:"x.csv"}], 讀試算表: async()=>rows, 查詢: async()=>db.map(m=>({...m})), 今天:()=>"2026-10-08",
    提示: m=>out.dlg.push("toast:"+m), h:(t,a,...k)=>k.flat(Infinity).filter(x=>x!=null).map(x=>typeof x==="string"?x:"").join(" | "),
    對話框: async(t,b)=>{out.dlg.push([].concat(b).filter(Boolean).join(" || ")); return true;},
    新增: async(t,r)=>{ for (const x of r) { if (x.email && db.some(m=>m.email===x.email)) { const e = new Error("已有相同 Email 的會員"); e.狀態碼 = 409; throw e; } }
      for (const x of r) { out.inserts.push(x); db.push({ id: "N" + (++nid), ...x }); } return r; },
    修改: async(t,c,d)=>{ if (d.email && db.some(m=>m.email===d.email && m.id!==c.id)) { const e = new Error("已有相同 Email 的會員"); e.狀態碼 = 409; throw e; } out.patches.push({id:c.id,...d}); Object.assign(db.find(m=>m.id===c.id),d);} };
  vm.createContext(ctx); vm.runInContext(code+";globalThis.R=匯入線上名冊;", ctx); await ctx.R(roster, ()=>{});
  const 預覽 = out.dlg[0] || "";
  return { ...out, db, 預覽, 計: (預覽.match(/新增 (\d+) 人、更新 (\d+) 人/) || []).slice(1).map(Number) };
}
const by = (db, id) => db.find(m => m.id === id);
const H6 = ["姓名","女0男1","服務機關","服務單位","職稱","電子郵件信箱"], H7 = H6.concat(["員工編號"]);

console.log("S1 匯出標準格式再匯入：名冊有兩位同名同機關（一位有 Email、一位沒有）");
const A = { id:"A", name:"王小明", gender:"男", agency:"財政部賦稅署", unit:"稅制組", title:"科員", email:"a@example.org" };
const C = { id:"C", name:"王小明", gender:"女", agency:"財政部賦稅署", unit:"綜所組", title:"專員", email:"" };
for (const order of [[A, C], [C, A]]) {
  const r = await run([A, C], [H6, ...order.map(m => [m.name, m.gender === "女" ? 0 : 1, m.agency, m.unit, m.title + "2", m.email])]);
  檢查(r.inserts.length === 0 && by(r.db,"A").unit === "稅制組" && by(r.db,"A").title === "科員2" && by(r.db,"C").unit === "綜所組" && by(r.db,"C").title === "專員2" && by(r.db,"C").gender === "女", "順序 " + order.map(m=>m.id).join("") + "：兩人各自更新，資料沒有互換");
}
console.log("S2 名冊 X（有 Email）＋檔案兩列同名：一列空白 Email、一列是新同事的 Email");
const X = { id:"X", name:"陳美玲", agency:"財政部賦稅署", unit:"稅制組", email:"x@example.org" };
for (const rows of [[["陳美玲",0,"財政部賦稅署","稅制組","科員",""],["陳美玲",0,"財政部賦稅署","法務組","科員","w@example.org"]], [["陳美玲",0,"財政部賦稅署","法務組","科員","w@example.org"],["陳美玲",0,"財政部賦稅署","稅制組","科員",""]]]) {
  const r = await run([X], [H6, ...rows]);
  檢查(by(r.db,"X").email === "x@example.org" && by(r.db,"X").unit === "稅制組" && r.inserts.length === 1 && r.inserts[0].email === "w@example.org", "X 保留原 Email，新同事另外新增（" + rows[0][3] + " 在前）");
}
console.log("S3 第二列的 Email 是別人（Y）的，員工編號、姓名指向 X");
{
  const X1 = { id:"X", name:"王小明", agency:"財政部賦稅署", employee_no:"E1", email:"x@example.org" }, Y = { id:"Y", name:"李大華", agency:"財政部國稅局", email:"y@example.org" };
  const r = await run([X1, Y], [H7, ["王小明",1,"財政部賦稅署","法務組","科員","","E1"], ["王小明",1,"財政部賦稅署","法務組","科員","y@example.org","E1"]]);
  檢查(by(r.db,"Y").name === "李大華" && by(r.db,"X").unit === "法務組" && by(r.db,"X").email === "x@example.org" && /屬於名冊上的「李大華」/.test(r.預覽), "Y 不被改名，X 的單位照樣更新，並說明略過原因");
}
console.log("S4 員工編號＋姓名相同、Email 換了（調職換公務信箱）");
{
  const r = await run([{ id:"X", name:"王小明", agency:"財政部賦稅署", employee_no:"E1", email:"old@example.org" }], [H7, ["王小明",1,"財政部關務署","稽查組","科員","new@example.org","E1"]]);
  檢查(r.inserts.length === 0 && by(r.db,"X").email === "new@example.org" && by(r.db,"X").agency === "財政部關務署", "更新原會員的 Email 與機關，不重複新增");
}
console.log("S5 Email 填成別人的（姓名、員工編號都是另一位）");
{
  const X1 = { id:"X", name:"王小明", agency:"財政部賦稅署", employee_no:"E1", email:"x@example.org" }, Y = { id:"Y", name:"李大華", agency:"財政部國稅局", employee_no:"E2", email:"y@example.org" };
  const r = await run([X1, Y], [H7, ["王小明",1,"財政部賦稅署","科A","科員","y@example.org","E1"]]);
  檢查(by(r.db,"Y").name === "李大華" && by(r.db,"Y").employee_no === "E2" && r.patches.length === 0 && r.inserts.length === 0, "略過，Y 不被覆蓋");
  const r2 = await run([X1, Y], [H7, ["李大華",1,"財政部國稅局","科B","科員","y@example.org","E9"]]);
  檢查(by(r2.db,"Y").employee_no === "E9" && by(r2.db,"Y").unit === "科B", "本人更正員工編號（Email、姓名相同）照常更新");
}
console.log("S6 沒有服務機關欄、沒有 Email 的新會員");
{
  const r = await run([], [["姓名","電子郵件信箱"], ["林志明",""], ["張三","z@example.org"]]);
  檢查(/有 1 位新會員沒有 Email、員工編號/.test(r.預覽) && r.inserts.length === 2, "預覽提醒無法比對、再匯入會重複");
}
console.log("S7 不同機關、員工編號相同、姓名不同（各機關各自編號）");
{
  const r = await run([], [H7, ["陳一",1,"財政部賦稅署","","","","E001"], ["林二",0,"財政部國稅局","","","","E001"]]);
  檢查(r.inserts.length === 2, "兩人分別新增，不合併");
}
console.log("S8 檔案內完全重複的列（沒有 Email）");
{
  const r = await run([], [H6, ["吳重複",1,"財政部國庫署","科A","科員",""], ["吳重複",1,"財政部國庫署","科A","科長",""]]);
  檢查(r.inserts.length === 1 && r.inserts[0].title === "科長" && /已合併/.test(r.預覽), "合併成一人");
}
console.log("S9 名冊只有 A；檔案 A（有 Email）＋A 的重複列（沒有 Email）");
{
  const r = await run([A], [H6, ["王小明",1,"財政部賦稅署","稅制組","科員","a@example.org"], ["王小明",1,"財政部賦稅署","稅制組","科長",""]]);
  檢查(r.inserts.length === 0 && r.patches.length === 1 && by(r.db,"A").title === "科長", "合併成對 A 的一筆更新");
}
console.log("S10 名冊兩位同名同機關都沒有 Email，檔案一列沒有 Email");
{
  const r = await run([{ ...C, id:"C1" }, { ...C, id:"C2", unit:"別組" }], [H6, ["王小明",0,"財政部賦稅署","新組","科員",""]]);
  檢查(r.patches.length === 0 && r.inserts.length === 0 && /無法判斷是誰/.test(r.預覽), "無法判斷，略過");
}
console.log("S11 檔案兩列 Email 相同、員工編號不同（新會員）");
{
  const r = await run([], [H7, ["趙五",1,"財政部國庫署","","","q@example.org","E5"], ["趙五",1,"財政部國庫署","","","q@example.org","E6"]]);
  檢查(r.inserts.length === 1 && /無法判斷是不是同一人/.test(r.預覽), "第二列略過");
}
console.log("S12 兩列對應到名冊同一位（一列用姓名、一列用 Email）");
{
  const Z = { id:"Z", name:"張重複", agency:"財政部高雄國稅局", email:"z@example.org" };
  const r = await run([Z], [H7, ["張重複",1,"財政部高雄國稅局","企劃科","科員","","E9"], ["張重複",1,"財政部高雄國稅局","企劃科","科長","z@example.org","E8"]]);
  檢查(r.patches.length === 1 && r.inserts.length === 0 && /都對應到名冊上的「張重複」/.test(r.預覽), "矛盾的第二列略過，只更新一次");
}
console.log("\n匯入比對測試：通過 " + 通過 + " 項，失敗 " + 失敗 + " 項");
process.exit(失敗 ? 1 : 0);
