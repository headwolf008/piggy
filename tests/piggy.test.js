/* jsdom 交互冒烟测试台：验证 「先金额→拍照(可跳过)」「真人民币图版」「改/删记录」「小猪满度」 */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const HTML_PATH = require("path").join(__dirname, "..", "piggy-bank.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra ? "  << " + extra : "")); }
}
function eq(name, actual, expect) {
  ok(name + " (=" + expect + ")", String(actual) === String(expect), "实际=" + actual);
}

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://piggy.local/",
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => null;
    win.confirm = () => win.__confirmAnswer !== false;
    win.alert = () => {};
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    win.onerror = (m) => { errors.push(m); };
  }
});
const win = dom.window, doc = win.document;
win.addEventListener("error", e => errors.push(String(e.error || e.message)));

document = doc;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const byId = (id) => doc.getElementById(id);
const click = (el) => { if (!el) throw new Error("click on null"); el.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); };
function clickChip(containerId, v) {
  const box = byId(containerId);
  const chip = Array.from(box.querySelectorAll(".chip")).find(c => c.getAttribute("data-v") === String(v));
  if (!chip) throw new Error(containerId + " 找不到面额 chip: " + v);
  click(chip);
  return chip;
}
function clickNth(containerId, n) { click(Array.from(byId(containerId).querySelectorAll(".chip"))[n]); }

console.log("\n=== 1. 结构 / 图版 sprite ===");
["sprite", "piggyBox", "pigLiquid", "pigLvl", "pigSub", "balNum", "btnHistory", "btnGoal", "btnBook",
 "sheetEdit", "sheetGoal", "sheetBook", "boxYuan", "boxJiao", "boxFen", "addYuan", "addJiao", "addFen",
 "editYuan", "editJiao", "editFen", "pigCash", "goalChips"].forEach(id => ok("存在 #" + id, !!byId(id)));

const symbols = $$("#sprite symbol").map(s => s.id);
["bk100", "bk50", "bk20", "bk10", "bk5", "bk1", "cn100", "cn50", "cn10", "cn1"].forEach(id =>
  ok("sprite 含 symbol #" + id, symbols.indexOf(id) >= 0, symbols.join(",")));
ok("防伪底纹 pattern bkTex 存在", !!byId("bkTex"));
ok("防伪花纹 pattern bkRos 存在", !!byId("bkRos"));
ok("小猪肚里的钱已生成", byId("pigCash").querySelectorAll("use").length >= 8,
   "数量=" + byId("pigCash").querySelectorAll("use").length);

// 引用完整性：所有 use 的 href 都能在 sprite 里找到
const useRefs = new Set();
$$("#sprite use, #pigCash use").forEach(u => {
  const r = u.getAttribute("href") || u.getAttribute("xlink:href");
  if (r) useRefs.add(r.replace("#", ""));
});
const missingRef = [...useRefs].filter(r => symbols.indexOf(r) < 0);
ok("所有 use 引用的 symbol 都存在", missingRef.length === 0, missingRef.join(","));

// 残留的旧环形/对比条引用
ok("无残留 ring 类名", doc.body.innerHTML.indexOf("ring-wrap") < 0 && doc.body.innerHTML.indexOf("ring-fg") < 0);
ok("无残留 cmp 对比条", doc.body.innerHTML.indexOf("cmp-bar") < 0 && doc.body.innerHTML.indexOf("cmp-left") < 0);

console.log("\n=== 2. 初始状态 ===");
eq("初始余额 = 200元", byId("balNum").textContent.trim(), "200");
const initialLvl = byId("pigLvl").textContent.trim();
ok("小猪初始满度文案非空", initialLvl.length > 0, initialLvl);
ok("小猪满度 '满了' 与初始 200/200 相符", initialLvl.indexOf("满") >= 0, initialLvl);
const lvl0 = byId("pigLiquid").style.transform;
ok("小猪水位已设 transform", /translateY/.test(lvl0), lvl0);

console.log("\n=== 3. 存钱流程（先金额 → 拍照可跳过）===");
click(byId("btnAdd"));
ok("存钱面板已打开", byId("sheetAdd").classList.contains("open"));
clickNth("addYuan", 5);                // 选金额
ok("选金额后显示预览", byId("addPreview").innerHTML.trim().length > 0);
ok("预览含「哪些真钱组成」教学图排", byId("addPreview").querySelectorAll(".cash-row .it").length > 0,
   "图排数=" + byId("addPreview").querySelectorAll(".cash-row .it").length);
ok("金额 chip 内含真钱图", byId("addYuan").querySelectorAll(".chip svg").length > 0);
click(byId("btnConfirmAdd"));
ok("存钱面板已关闭", !byId("sheetAdd").classList.contains("open"));

console.log("\n=== 4. 记账本出现这一笔 ===");
click(byId("btnHistory"));
ok("记账本已打开", byId("sheetHistory").classList.contains("open"));
const cards0 = byId("historyBox").querySelectorAll(".hist");
ok("记账本有记录卡片", cards0.length >= 1, "数量=" + cards0.length);
const lastCard = cards0[cards0.length - 1];
ok("卡片有 ✏️ 修改按钮", !!lastCard.querySelector(".acts .ed"));
ok("卡片有 🗑 删除按钮", !!lastCard.querySelector(".acts .dl"));
click(byId("btnHistory"));   // 关掉

console.log("\n=== 5. 改记录金额 ===");
const beforeBal = byId("balNum").textContent.trim();
click(byId("btnHistory"));
click(byId("historyBox").querySelectorAll(".hist")[byId("historyBox").querySelectorAll(".hist").length - 1].querySelector(".ed"));
ok("编辑面板已打开", byId("sheetEdit").classList.contains("open"));
eq("编辑面板标题正确", byId("editTitle").textContent.trim(), "✏️ 改这笔存钱");
clickNth("editYuan", 3);         // 改金额
click(byId("btnEditSave"));
ok("编辑面板已关闭", !byId("sheetEdit").classList.contains("open"));
const afterBal = byId("balNum").textContent.trim();
ok("改金额后余额变化", afterBal !== beforeBal, beforeBal + " → " + afterBal);
click(byId("btnHistory"));

console.log("\n=== 6. 删记录 ===");
const beforeDel = byId("balNum").textContent.trim();
const nBefore = byId("historyBox").querySelectorAll(".hist").length;
click(byId("historyBox").querySelectorAll(".hist")[byId("historyBox").querySelectorAll(".hist").length - 1].querySelector(".dl"));
const nAfter = byId("historyBox").querySelectorAll(".hist").length;
ok("删除后卡片数 -1", nAfter === nBefore - 1, nBefore + " → " + nAfter);
const afterDel = byId("balNum").textContent.trim();
ok("删除后余额回滚", afterDel !== beforeDel, beforeDel + " → " + afterDel);
click(byId("btnHistory"));

console.log("\n=== 7. 设目标 → 满度重新标定 ===");
click(byId("btnGoal"));
ok("目标面板已打开", byId("sheetGoal").classList.contains("open"));
ok("目标面板有预设目标金额", byId("goalChips").querySelectorAll(".chip").length > 0,
   "数量=" + byId("goalChips").querySelectorAll(".chip").length);
byId("goalInput").value = "1000";
click(byId("btnGoalSet"));
ok("设自定义目标后弹层关闭", !byId("sheetGoal").classList.contains("open"));
const pctAfterGoal = parseInt(byId("pigLvl").textContent, 10);
ok("设 1000 目标后满度变小（不是直接满）", pctAfterGoal > 0 && pctAfterGoal < 100, byId("pigLvl").textContent);
ok("小猪副标题提示「还差」", byId("pigSub").textContent.indexOf("还差") >= 0,
   byId("pigSub").textContent.replace(/\s+/g, " ").trim().slice(0, 80));
// 预设 chip 也应能设目标 + 关弹层
click(byId("btnGoal"));
const preset = Array.from(byId("goalChips").querySelectorAll(".chip")).find(c => c.getAttribute("data-v") === "");
click(Array.from(byId("goalChips").querySelectorAll(".chip"))[1]);
ok("点预设目标后弹层关闭", !byId("sheetGoal").classList.contains("open"));
const presetLvl = byId("pigLvl").textContent.trim();
ok("预设目标生效（满度重新计算）", /\d+%|满/.test(presetLvl), presetLvl);

console.log("\n=== 7b. 小猪水位随余额变化 ===");
// 把目标设得比余额大，这样水位会随余额真实起伏（否则一直 clamp 在 100%）
click(byId("btnGoal")); byId("goalInput").value = "9999"; click(byId("btnGoalSet"));
const lvlBefore = byId("pigLiquid").style.transform;
const lvNum = parseFloat((lvlBefore.match(/translateY\(([-\d.]+)px\)/) || [0, "NaN"])[1]);
ok("目标远大于余额时小猪接近空 (translateY 接近 152)", lvNum > 48 && lvNum <= 152, lvlBefore);
click(byId("btnAdd"));
clickNth("addYuan", 3);                 // 存一笔
click(byId("btnConfirmAdd"));
const lvlAfterAdd = byId("pigLiquid").style.transform;
const lvNum2 = parseFloat((lvlAfterAdd.match(/translateY\(([-\d.]+)px\)/) || [0, "NaN"])[1]);
ok("存钱后小猪水位上升（translateY 变小）", lvNum2 < lvNum, lvlBefore + " → " + lvlAfterAdd);
const pctTxt = byId("pigLvl").textContent.trim();
ok("满度百分比文案存在", /\d+%|满/.test(pctTxt), pctTxt);

console.log("\n=== 9. 人民币图鉴 ===");
click(byId("btnBook"));
ok("图鉴面板已打开", byId("sheetBook").classList.contains("open"));
const bkCards = byId("bookGrid").querySelectorAll(".bk-card");
eq("图鉴卡片数 = 9", bkCards.length, 9);
ok("图鉴卡片都有钱图", bkCards.length > 0 && Array.from(bkCards).every(c => c.querySelector("svg")));
click(byId("sheetBook").querySelector("[data-close]") || byId("sheetBook"));

console.log("\n=== 10. 买东西面板（也是先金额）===");
click(byId("btnBuy"));
ok("买东西面板已打开", byId("sheetBuy").classList.contains("open"));
clickNth("chipsYuan", 1);
const balBeforeBuy = byId("balNum").textContent.trim();
click(byId("btnConfirmBuy"));
const balAfterBuy = byId("balNum").textContent.trim();
ok("花钱后余额下降", balAfterBuy !== balBeforeBuy, balBeforeBuy + " → " + balAfterBuy);

console.log("\n=== 11. 持久化（重新加载后仍在）===");
const saved = win.localStorage.getItem("kid_piggy_bank_v3");
ok("已写入 localStorage", !!saved && saved.length > 10);
const parsed = JSON.parse(saved || "{}");
ok("存档含 goal 字段", parsed.goal !== undefined, JSON.stringify(parsed).slice(0, 120));
ok("存档含 items / deposits", Array.isArray(parsed.items) && Array.isArray(parsed.deposits),
   "items=" + (parsed.items || []).length + ", deposits=" + (parsed.deposits || []).length);

console.log("\n=== 12. 运行时错误 ===");
ok("无运行时错误", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log("\n──────────────────────────────");
console.log("通过 " + pass + " · 失败 " + fail + (fail ? "\n失败项: " + fails.join(" / ") : ""));
process.exit(fail ? 1 : 0);
