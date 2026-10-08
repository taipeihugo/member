// 會員專區「匯入名冊」比對規則的單元測試：直接執行原始碼裡的 匯入線上名冊（讀檔、對話框、資料庫都用假的）
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
const 原始碼 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "線上");
const src = fs.readFileSync(path.join(原始碼, "20_幹部.js"), "utf8");
const conn = fs.readFileSync(path.join(原始碼, "01_連線.js"), "utf8");
// 從原始碼切出 a 到 b 之間的程式
const g = (t, a, b) => { const i = t.indexOf(a); if (i < 0) throw a; return t.slice(i, t.indexOf(b, i)); };
const code = [g(src,"const 線上匯入別名","// 把名冊裡的理監事"),g(src,"function 轉理監事","// 兩個值是否不衝突"),g(src,"function 不衝突","// 匯入名冊："),g(src,"async function 匯入線上名冊","// ===== 申請審核"),g(conn,"function 暫時錯誤","// 實際送出")].join("\n");
let 通過 = 0, 失敗 = 0;
const 檢查 = (c, m) => { if (c) 通過++; else 失敗++; console.log((c ? "  ✔ " : "  ✘ ") + m); };
// 用指定的名冊與試算表內容執行一次匯入，回傳預覽文字、新增與修改的資料、匯入後的名冊
async function run(roster, rows) {
  const db = roster.map(m=>({ email: "", employee_no: "", ...m })); let nid = 0; const out = { patches: [], inserts: [], dlg: [] };
  const ctx = { console, 連線: { 帳號: { id: "me" } }, 預設職稱們: [], 線上: { 職稱們: [{ title: "理事長", board_role: "理事" }, { title: "理事", board_role: "理事" }, { title: "候補理事", board_role: "理事" }, { title: "監事", board_role: "監事" }] }, 選擇檔案: async()=>[{name:"x.csv"}], 讀試算表: async()=>rows, 查詢: async()=>db.map(m=>({...m})), 今天:()=>"2026-10-08",
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
  檢查(by(r.db,"Y").name === "李大華" && by(r.db,"X").email === "x@example.org" && r.patches.length === 0 && /屬於名冊上的「李大華」/.test(r.預覽), "兩列（員工編號＋姓名相同）視為同一人，其 Email 卻是 Y 的：整組略過並說明，Y 不被改名");
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
  檢查(r.inserts.length === 0 && /無法判斷是不是同一人/.test(r.預覽), "無法判斷，兩列都略過並說明");
}
console.log("S12 兩列對應到名冊同一位（一列用姓名、一列用 Email）");
{
  const Z = { id:"Z", name:"張重複", agency:"財政部高雄國稅局", email:"z@example.org" };
  const r = await run([Z], [H7, ["張重複",1,"財政部高雄國稅局","企劃科","科員","","E9"], ["張重複",1,"財政部高雄國稅局","企劃科","科長","z@example.org","E8"]]);
  檢查(r.patches.length === 1 && r.inserts.length === 0 && /都對應到名冊上的「張重複」/.test(r.預覽), "矛盾的第二列略過，只更新一次");
}
// 兩種列的順序（原順序與倒過來）都跑一次，結果（名冊最後的樣子、新增與修改的筆數）必須一樣
async function 兩種順序(名冊, 標題, 列們) {
  const 甲 = await run(名冊, [標題, ...列們]);
  const 乙 = await run(名冊, [標題, ...列們.slice().reverse()]);
  const 樣子 = (r) => JSON.stringify(r.db.map(({ id, ...m }) => (id.startsWith("N") ? m : { id, ...m })).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  檢查(樣子(甲) === 樣子(乙) && 甲.計.join() === 乙.計.join(), "兩種列的順序結果相同");
  return 甲;
}
const 員 = ["姓名","女0男1","服務機關","服務單位","職稱","電子郵件信箱","員工編號"];
console.log("S13 員工編號欄有填、Email 打成別人的（名冊上本人沒有員工編號）");
{
  const X1 = { id:"X", name:"王小明", agency:"財政部賦稅署", email:"x@example.org" }, Y = { id:"Y", name:"李大華", agency:"財政部國稅局", email:"y@example.org" };
  const r = await 兩種順序([X1, Y], 員, [["王小明",1,"財政部賦稅署","法務組","科員","y@example.org","E1"]]);
  檢查(by(r.db,"Y").name === "李大華" && r.patches.length === 0 && /屬於名冊上的「李大華」/.test(r.預覽), "略過，Y 不被改成王小明");
  const r2 = await 兩種順序([X1, { ...Y }], 員, [["王小明",1,"財政部賦稅署","法務組","科員","","E1"], ["王小明",1,"財政部賦稅署","法務組","科員","y@example.org","E1"]]);
  檢查(by(r2.db,"Y").name === "李大華", "加上 X 自己那一列時，Y 也不被覆蓋");
  const r3 = await 兩種順序([{ ...X1, employee_no: "e1" }, Y], 員, [["王小明",1,"財政部賦稅署","法務組","科員","y@example.org","E1"]]);
  檢查(by(r3.db,"Y").name === "李大華" && r3.patches.length === 0, "員工編號只差大小寫（e1／E1）也視為相同，照樣略過");
}
console.log("S14 名冊兩位同名同機關（A 有 Email、C 沒有），檔案是 A 的兩列（一列沒填 Email，員工編號相同）");
{
  const A1 = { id:"A", name:"王一", agency:"財政部賦稅署", email:"a@example.org" }, C1 = { id:"C", name:"王一", agency:"財政部賦稅署", unit:"原單位" };
  const r = await 兩種順序([A1, C1], 員, [["王一",1,"財政部賦稅署","法務組","科長","a@example.org","E1"], ["王一",1,"財政部賦稅署","法務組","科長","","E1"]]);
  檢查(r.計.join() === "0,1" && by(r.db,"A").employee_no === "E1" && by(r.db,"C").unit === "原單位" && !by(r.db,"C").employee_no, "兩列合併成 A，C 不被動到");
}
console.log("S15 A 換了公務信箱（員工編號相同），檔案有 A 的新信箱列與沒有員工編號的重複列；名冊另有同名的 C");
{
  const A1 = { id:"A", name:"王一", agency:"財政部賦稅署", email:"a@example.org", employee_no:"E1" }, C1 = { id:"C", name:"王一", agency:"財政部賦稅署", unit:"原單位" };
  const r = await 兩種順序([A1, C1], 員, [["王一",1,"財政部賦稅署","法務組","科長","n@example.org","E1"], ["王一",1,"財政部賦稅署","法務組","科長","n@example.org",""]]);
  檢查(by(r.db,"A").email === "n@example.org" && by(r.db,"C").unit === "原單位" && !by(r.db,"C").email && r.inserts.length === 0, "更新 A 的信箱，C 不被動到");
}
console.log("S16 名冊 Z（只有 Email），檔案一列用姓名、一列用 Email 對應到 Z，員工編號不同");
{
  const Z = { id:"Z", name:"張重複", agency:"財政部高雄國稅局", email:"z@example.org" };
  const r = await 兩種順序([Z], 員, [["張重複",1,"財政部高雄國稅局","企劃科","科員","","E9"], ["張重複",1,"財政部高雄國稅局","第二科","科長","z@example.org","E8"]]);
  檢查(by(r.db,"Z").employee_no === "E8" && by(r.db,"Z").unit === "第二科" && r.inserts.length === 0 && /都對應到名冊上的「張重複」/.test(r.預覽), "以 Email 對應的那一列為準，矛盾的另一列略過");
}
console.log("S17 名冊 M（舊信箱、E1），檔案有 M 的新信箱兩列（一列沒填員工編號），機關也換了");
{
  const M = { id:"M", name:"林志明", agency:"財政部賦稅署", email:"old@example.org", employee_no:"E1" };
  const r = await 兩種順序([M], 員, [["林志明",1,"財政部國稅局","審查科","科員","new@example.org",""], ["林志明",1,"財政部國稅局","審查科","科員","new@example.org","E1"]]);
  檢查(r.inserts.length === 0 && by(r.db,"M").email === "new@example.org" && by(r.db,"M").agency === "財政部國稅局", "只更新 M，不新增重複的人");
}
console.log("S18 A 調到國稅局：檔案有 A 的列（有 Email）與沒填 Email 的重複列");
{
  const A1 = { id:"A", name:"王小明", agency:"財政部賦稅署", email:"a@example.org" };
  const r = await 兩種順序([A1], 員, [["王小明",1,"財政部國稅局","審查科","科員","a@example.org","E1"], ["王小明",1,"財政部國稅局","審查科","科員","","E1"]]);
  檢查(r.計.join() === "0,1" && r.inserts.length === 0, "有員工編號欄：合併成 A 的一筆更新");
  const r2 = await 兩種順序([A1], H6, [["王小明",1,"財政部國稅局","審查科","科員","a@example.org"], ["王小明",1,"財政部國稅局","審查科","科員",""]]);
  檢查(r2.計.join() === "0,1" && r2.inserts.length === 0, "沒有員工編號欄：也合併成 A 的一筆更新");
}
console.log("S19 先前各情境換順序");
await 兩種順序([A, C], H6, [["王小明",1,"財政部賦稅署","稅制組","科員2","a@example.org"], ["王小明",0,"財政部賦稅署","綜所組","專員2",""]]);
await 兩種順序([X], H6, [["陳美玲",0,"財政部賦稅署","稅制組","科員",""], ["陳美玲",0,"財政部賦稅署","法務組","科員","w@example.org"]]);
await 兩種順序([], 員, [["趙五",1,"財政部國庫署","","","q@example.org","E5"], ["趙五",1,"財政部國庫署","","","q@example.org","E6"]]);

// 列的所有排列（最多 4 列）
const 排列 = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => 排列([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r]));
// 所有排列都跑一次：新增／更新筆數、被更新的會員、新增的人（姓名／Email／員工編號）必須一樣（其他欄位依「後面的列覆蓋前面」本來就會不同）
async function 各種順序(名冊, 標題, 列們) {
  const 結果們 = [];
  for (const 序 of 排列(列們)) {
    const r = await run(名冊, [標題, ...序]);
    結果們.push({ r, 指紋: JSON.stringify([r.計, [...new Set(r.patches.map((p) => p.id))].sort(), r.inserts.map((x) => [x.name, x.email || "", String(x.employee_no || "").toLowerCase()].join("/")).sort()]) });
  }
  return { 一致: 結果們.every((x) => x.指紋 === 結果們[0].指紋), 結果們, r: 結果們[0].r };
}
console.log("S20 名冊 M（有 Email、沒有員工編號）；檔案 M 的 Email 列＋兩列同名同機關、沒填 Email、員工編號不同");
{
  const M = { id:"M", name:"王小明", agency:"財政部賦稅署", unit:"稅制組", email:"wang@example.org" };
  const x = await 各種順序([M], 員, [["王小明",1,"財政部賦稅署","稅制組","科員","wang@example.org",""], ["王小明",1,"財政部賦稅署","稅制組","科員","","A1001"], ["王小明",1,"財政部賦稅署","法務組","科員","","A1002"]]);
  檢查(x.一致 && x.結果們.every((y) => !by(y.r.db,"M").employee_no && by(y.r.db,"M").unit === "稅制組" && /都對應到名冊上的「王小明」/.test(y.r.預覽)), "六種順序結果相同：M 不寫入任何員工編號，兩列都略過並說明");
}
console.log("S21 調職：名冊 M 在國庫署（沒有 Email、員工編號），檔案有舊機關與新機關兩列（員工編號相同）");
{
  const M = { id:"M", name:"王小明", agency:"財政部國庫署", unit:"國庫組" };
  const x = await 各種順序([M], 員, [["王小明",1,"財政部國庫署","國庫組","科員","","A1234"], ["王小明",1,"財政部賦稅署","稅制組","科員","","A1234"]]);
  檢查(x.一致 && x.r.計.join() === "0,1" && x.結果們.every((y) => by(y.r.db,"M").employee_no === "A1234"), "兩種順序都更新 M，不重複新增");
  const x2 = await 各種順序([M], H6, [["王小明",1,"財政部國庫署","國庫組","科員","w@example.org"], ["王小明",1,"財政部賦稅署","稅制組","科員","w@example.org"]]);
  檢查(x2.一致 && x2.r.計.join() === "0,1", "用同一個 Email 時也一樣");
}
console.log("S22 名冊 L（賦稅署、有 Email）調到北區國稅局：檔案有新機關 Email 列、舊機關空白列、新機關空白列");
{
  const L = { id:"L", name:"林志明", agency:"財政部賦稅署", unit:"稅制組", email:"lin@example.org" };
  const x = await 各種順序([L], H6, [["林志明",1,"財政部北區國稅局","審查科","科員","lin@example.org"], ["林志明",1,"財政部賦稅署","稅制組","科員",""], ["林志明",1,"財政部北區國稅局","審查科","科員",""]]);
  檢查(x.一致 && x.r.計.join() === "0,1", "六種順序都只更新 L，不重複新增");
}
console.log("S23 名冊 陳美玲（chen@）；檔案有 陳美玲 空白 Email 列，與複製時忘了改 Email 的 王小明（chen@）");
{
  const M = { id:"M", name:"陳美玲", agency:"財政部賦稅署", unit:"稅制組", email:"chen@example.org" };
  const x = await 各種順序([M], H6, [["陳美玲",0,"財政部賦稅署","稅制組","科員",""], ["王小明",1,"財政部賦稅署","法務組","科員","chen@example.org"]]);
  檢查(x.一致 && x.結果們.every((y) => /但姓名不同/.test(y.r.預覽) && y.r.inserts.length === 0), "兩種順序結果相同，陳美玲那列因姓名不同而略過並說明");
}
console.log("S24 名冊兩位同名、員工編號也相同（各機關各自編號）；檔案一列 Email 唯一對到其中一位");
{
  const A1 = { id:"A", name:"陳建宏", agency:"財政部賦稅署", email:"chen.jh@example.org", employee_no:"00123" }, B1 = { id:"B", name:"陳建宏", agency:"財政部國庫署", email:"jhchen@example.org", employee_no:"00123" };
  const r = await run([A1, B1], [員, ["陳建宏",1,"財政部賦稅署","法務組","科長","chen.jh@example.org","00123"]]);
  檢查(r.patches.length === 1 && r.patches[0].id === "A" && by(r.db,"B").unit === undefined, "依 Email 更新賦稅署那位");
}
console.log("S26 理監事欄依系統設定的職稱清單（含新增的職稱）");
{
  const r = await run([], [["姓名","服務機關","電子郵件信箱","理監事"], ["甲",'財政部賦稅署',"a1@example.org","候補理事"], ["乙","財政部賦稅署","b1@example.org","常務監事"], ["丙","財政部賦稅署","c1@example.org","監事"]]);
  const 甲 = r.inserts.find((x) => x.name === "甲"), 乙 = r.inserts.find((x) => x.name === "乙"), 丙 = r.inserts.find((x) => x.name === "丙");
  檢查(甲.board_role === "理事" && 甲.board_title === "候補理事" && 丙.board_role === "監事" && 乙.board_role === "" && /理監事欄看不懂（常務監事）/.test(r.預覽), "新增的職稱看得懂，清單裡沒有的職稱列為問題（新增者設為「無」）");
}
console.log("S25 隨機情境：所有列的排列結果都相同");
{
  let 種子 = 20261008;
  const 亂 = (n) => { 種子 = (種子 * 1103515245 + 12345) % 2147483648; return 種子 % n; };
  const 選 = (a) => a[亂(a.length)];
  const 名們 = ["王一", "陳二"], 機們 = ["甲署", "乙署"], 信們 = ["a@example.org", "b@example.org", ""], 編們 = ["E1", "e1", "E2", ""];
  let 不一致 = 0, 例 = "";
  for (let 次 = 0; 次 < 3000; 次++) {
    const 名冊 = Array.from({ length: 亂(3) }, (_, i) => ({ id: "R" + i, name: 選(名們), agency: 選(機們), email: "", employee_no: 選(["", "", "E1", "E2"]) }));
    名冊.forEach((m, i) => { if (亂(2)) m.email = "r" + i + "@example.org"; });
    const 列們 = Array.from({ length: 2 + 亂(3) }, () => [選(名們), 1, 選(機們), "單位" + 亂(3), "科員", 選(信們.concat(名冊.map((m) => m.email).filter(Boolean))), 選(編們)]);
    const x = await 各種順序(名冊, 員, 列們);
    if (!x.一致) { 不一致++; if (!例) 例 = JSON.stringify({ 名冊, 列們 }); }
  }
  檢查(不一致 === 0, "3000 組隨機名冊與檔案（2～4 列），各種列的順序結果都相同" + (例 ? "（例：" + 例 + "）" : ""));
}

console.log("\n匯入比對測試：通過 " + 通過 + " 項，失敗 " + 失敗 + " 項");
process.exit(失敗 ? 1 : 0);
