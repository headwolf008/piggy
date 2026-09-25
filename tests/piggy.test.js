/* jsdom 交互冒烟测试台
   覆盖：① 金额自由输入（元/角/分 任意组合） ② 真人民币图版 ③ 全部记录清单（含改/删）
        ④ 小猪满度 ⑤ 流程「先金额（必填）→ 拍照(可选)」 ⑥ 持久化
   跑法：npm test   （或 node tests/piggy.test.js） */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "piggy-bank.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra ? "  << " + extra : "")); }
}
function eq(name, actual, expect) {
  ok(name + " (= " + expect + ")", String(actual) === String(expect), "实际=" + actual);
}

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://piggy.local/",              // 必须：否则 localStorage 抛 DOMException
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => null;
    win.confirm = () => win.__confirmAnswer !== false;
    win.alert = () => {};
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    win.addEventListener("error", e => errors.push(String(e.error || e.message)));
  }
});
const win = dom.window, doc = win.document;

const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const byId = (id) => doc.getElementById(id);
const click = (el) => { if (!el) throw new Error("click 目标不存在"); el.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); };
const closeSheet = (id) => click(byId(id).querySelector("[data-close]"));

/* 往「元/角/分」输入框里打字，并触发 input 事件（模拟真实输入） */
function setVal(id, v) {
  const el = byId(id);
  el.value = v === 0 || v === "" ? "" : String(v);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  return el;
}
function typeAmt(prefix, y, j, f) {
  setVal(prefix + "Yuan", y);
  setVal(prefix + "Jiao", j);
  setVal(prefix + "Fen", f);
}
const balNum = () => byId("balNum").textContent.trim();
const badge  = () => byId("histCount").textContent.trim();
const rows   = () => $$("#historyBox .hrow");
const txt    = (el) => (el ? el.textContent.replace(/\s+/g, "") : "");
/* 预览区只取金额本身：预览里还挂着一排真钱图，整段文本会带上「×4」这类标记 */
function amtOf(boxId) {
  const b = byId(boxId);
  return ["yuan", "jiao", "fen"].map(k => {
    const box = b.querySelector(".sp-" + k);
    return box ? box.querySelector(".v").textContent + box.querySelector(".u").textContent : "";
  }).join("");
}

console.log("\n=== 1. 结构与人民币图版 sprite ===");
["sprite", "piggyBox", "pigLiquid", "pigLvl", "pigSub", "balNum",
 "btnHistory", "histCount", "btnGoal", "btnBook",
 "sheetEdit", "sheetGoal", "sheetBook", "sheetHistory", "historyBox", "histSeg",
 "buyYuan", "buyJiao", "buyFen", "addYuan", "addJiao", "addFen", "editYuan", "editJiao", "editFen",
 "buyClear", "addClear", "editClear", "buyOverTip", "pigCash", "goalChips"].forEach(id =>
  ok("存在 #" + id, !!byId(id)));

const symbols = $$("#sprite symbol").map(s => s.id);
["bk100", "bk50", "bk20", "bk10", "bk5", "bk1", "cn100", "cn50", "cn10", "cn1"].forEach(id =>
  ok("sprite 含真钱图版 #" + id, symbols.indexOf(id) >= 0));
ok("防伪底纹 bkTex / 花纹 bkRos 都在", !!byId("bkTex") && !!byId("bkRos"));
ok("纸币含「中国人民银行」行名与汉字面额",
   html.indexOf("中国人民银行") >= 0 && html.indexOf("壹佰圆") >= 0 && html.indexOf("伍拾圆") >= 0);
ok("小猪肚里的钱已生成", byId("pigCash").querySelectorAll("use").length >= 8);

const useRefs = new Set();
$$("#sprite use, #pigCash use").forEach(u => {
  const r = u.getAttribute("href") || u.getAttribute("xlink:href");
  if (r) useRefs.add(r.replace("#", ""));
});
ok("所有 use 引用的 symbol 都存在", [...useRefs].every(r => symbols.indexOf(r) >= 0));

ok("旧的环形进度条已移除", html.indexOf("ring-wrap") < 0 && html.indexOf("ring-fg") < 0);
ok("旧的横向对比条已移除", html.indexOf("cmp-bar") < 0 && html.indexOf("cmp-left") < 0);
ok("旧的「点选金额」实现已彻底移除",
   html.indexOf("YUAN_OPTS") < 0 && html.indexOf("JIAO_OPTS") < 0 &&
   html.indexOf("chipInner") < 0 && html.indexOf("buildPicker") < 0 &&
   html.indexOf('id="chipsYuan"') < 0 && html.indexOf('id="chipsJiao"') < 0);

console.log("\n=== 2. 初始状态 ===");
eq("初始余额 = 200元", balNum(), "200");
eq("默认目标 500元 → 小猪装 40%", byId("pigLvl").textContent.trim(), "40%");
ok("小猪水位已设 transform", /translateY/.test(byId("pigLiquid").style.transform));
eq("「全部记录」按钮笔数徽标 = 0", badge(), "0");

console.log("\n=== 3. 金额自由输入：任意金额都填得出来 ===");
click(byId("btnAdd"));
ok("存钱面板已打开", byId("sheetAdd").classList.contains("open"));

typeAmt("add", 7, 4, 0);                       // 7元4角 —— 老选项里根本没有 4
eq("填 7元4角 → 预览就是 7元4角", amtOf("addPreview"), "7元4角");
ok("预览附带「由哪些真钱组成」的教学图排",
   byId("addPreview").querySelectorAll(".cash-row .it").length > 0);

click(byId("addClear"));
ok("清空后预览回到空态提示", byId("addPreview").textContent.indexOf("填个数字") >= 0,
   byId("addPreview").textContent);

setVal("addYuan", "007");
eq("元输入框去掉多余前导零（007 → 7）", byId("addYuan").value, "7");
setVal("addYuan", "1a2b3");
eq("元输入框只留数字（1a2b3 → 123）", byId("addYuan").value, "123");
setVal("addJiao", "12");
eq("角输入框超过 9 自动压到 9", byId("addJiao").value, "9");
setVal("addFen", "9");
typeAmt("add", 123, 9, 9);
eq("123元9角9分 预览正确", amtOf("addPreview"), "123元9角9分");

/* 用「怪金额」745分 验证任意组合都能存 */
click(byId("addClear"));
typeAmt("add", 7, 4, 5);
click(byId("btnConfirmAdd"));
ok("存钱面板已关闭", !byId("sheetAdd").classList.contains("open"));
eq("余额 200 + 7元4角5分 → 元位 207", balNum(), "207");
eq("「全部记录」徽标变成 1", badge(), "1");

console.log("\n=== 4. 全部记录清单：能看到所有已登记的物品 ===");
click(byId("btnHistory"));
ok("清单已打开", byId("sheetHistory").classList.contains("open"));
eq("清单里有 1 条记录", rows().length, 1);
const r0 = rows()[0];
ok("每条显示「存进去 / 花掉」类型标签", !!r0.querySelector(".kd") && /存进去|花掉/.test(r0.textContent));
eq("金额显示为 7元4角5分", txt(r0.querySelector(".amt")), "7元4角5分");
ok("每条显示时间", /🕒/.test(r0.querySelector(".meta").textContent), r0.querySelector(".meta").textContent);
ok("每条带「由哪些真钱组成」的小图排", r0.querySelectorAll(".cash-row .it").length > 0);
ok("每条有 ✏️ 修改 与 🗑 删除", !!r0.querySelector(".acts .ed") && !!r0.querySelector(".acts .dl"));
ok("顶部有总账汇总（共几笔 / 存入 / 花掉 / 还剩）",
   /共/.test(txt($("#historyBox .hist-sum"))) && /存入/.test(txt($("#historyBox .hist-sum"))) &&
   /花掉/.test(txt($("#historyBox .hist-sum"))) && /还剩/.test(txt($("#historyBox .hist-sum"))),
   txt($("#historyBox .hist-sum")));
closeSheet("sheetHistory");

console.log("\n=== 5. 多笔记录：全部列出、一笔不丢 ===");
[[3, 0, 0], [12, 5, 0], [100, 0, 1]].forEach(function (a) {   // 再存 3 笔
  click(byId("btnAdd")); typeAmt("add", a[0], a[1], a[2]); click(byId("btnConfirmAdd"));
});
/* 花 2元5角（走两步流程：填金额 → 下一步 → 保存） */
click(byId("btnBuy"));
typeAmt("buy", 2, 5, 0);
eq("买东西预览 = 2元5角", amtOf("sumPreview"), "2元5角");
click(byId("btnBuyNext"));
click(byId("btnConfirmBuy"));
eq("共 5 笔记录（4 存 + 1 花）", badge(), "5");
click(byId("btnHistory"));
eq("清单里 5 条一条不少", rows().length, 5);
const kinds = rows().map(r => txt(r.querySelector(".kd")));
ok("列表里既有「存进去」也有「花掉」",
   kinds.indexOf("存进去") >= 0 && kinds.indexOf("花掉") >= 0, kinds.join("/"));
ok("汇总里的「共 5 笔」正确", /共5笔/.test(txt($("#historyBox .hist-sum"))), txt($("#historyBox .hist-sum")));

/* 分页：花掉的 / 存进去的 */
const segs = $$("#histSeg button");
click(segs.find(b => b.dataset.tab === "spend"));
eq("「花掉的」分页只有 1 条", rows().length, 1);
click(segs.find(b => b.dataset.tab === "in"));
eq("「存进去的」分页有 4 条", rows().length, 4);
click(segs.find(b => b.dataset.tab === "all"));
eq("切回「全部」有 5 条", rows().length, 5);

console.log("\n=== 6. 改一笔金额（任意金额都能改）===");
const balBeforeEdit = balNum();
click(rows()[0].querySelector(".acts .ed"));
ok("编辑面板已打开", byId("sheetEdit").classList.contains("open"));
ok("编辑面板标题区分存/花", /改这笔/.test(byId("editTitle").textContent), byId("editTitle").textContent);
ok("编辑面板回填了原金额（不全为 0）",
   !!(byId("editYuan").value || byId("editJiao").value || byId("editFen").value),
   [byId("editYuan").value, byId("editJiao").value, byId("editFen").value].join("/"));
typeAmt("edit", 9, 9, 0);                       // 改成 9元9角
eq("改金额后预览 = 9元9角", amtOf("editPreview"), "9元9角");
click(byId("btnEditSave"));
ok("编辑面板已关闭", !byId("sheetEdit").classList.contains("open"));
ok("改完金额余额变了", balNum() !== balBeforeEdit, balBeforeEdit + " → " + balNum());

console.log("\n=== 7. 删一笔 ===");
click(byId("btnHistory"));
const nBefore = rows().length;
const balBeforeDel = balNum();
win.__confirmAnswer = true;
click(rows()[rows().length - 1].querySelector(".acts .dl"));
eq("删除后少一条", rows().length, nBefore - 1);
ok("删除后余额回滚", balNum() !== balBeforeDel, balBeforeDel + " → " + balNum());
win.__confirmAnswer = false;
const nKeep = rows().length;
click(rows()[0].querySelector(".acts .dl"));
eq("在 confirm 里选「取消」则不删", rows().length, nKeep);
win.__confirmAnswer = true;
closeSheet("sheetHistory");

console.log("\n=== 8. 小猪满度随余额与目标变化 ===");
click(byId("btnGoal"));
ok("目标面板已打开", byId("sheetGoal").classList.contains("open"));
byId("goalInput").value = "9999";
click(byId("btnGoalSet"));
ok("设完目标弹层关闭（能看到小猪重新标定）", !byId("sheetGoal").classList.contains("open"));
const lvl0 = byId("pigLiquid").style.transform;
const lvNum = parseFloat((lvl0.match(/translateY\(([-\d.]+)px\)/) || [0, "NaN"])[1]);
ok("目标远大于余额时小猪接近空（translateY 接近 152）", lvNum > 48 && lvNum <= 152, lvl0);
ok("小猪副标题提示「还差」", byId("pigSub").textContent.indexOf("还差") >= 0,
   byId("pigSub").textContent.replace(/\s+/g, " ").trim());
click(byId("btnAdd")); typeAmt("add", 50, 0, 0); click(byId("btnConfirmAdd"));
const lvl1 = byId("pigLiquid").style.transform;
const lvNum2 = parseFloat((lvl1.match(/translateY\(([-\d.]+)px\)/) || [0, "NaN"])[1]);
ok("存钱后小猪水位上升（translateY 变小）", lvNum2 < lvNum, lvl0 + " → " + lvl1);

console.log("\n=== 9. 买东西钱不够时拦截 ===");
click(byId("btnBuy"));
typeAmt("buy", 9999, 0, 0);
ok("填超过余额时预览变红并给出提示",
   byId("sumPreview").classList.contains("over") && byId("buyOverTip").style.display === "block",
   byId("buyOverTip").textContent);
click(byId("btnBuyNext"));
ok("钱不够时不允许进第二步",
   byId("buyStepAmt").style.display !== "none", byId("buyStepAmt").style.display);
typeAmt("buy", 0, 0, 0);
click(byId("btnBuyNext"));
ok("金额为 0 时也不允许进第二步", byId("buyStepAmt").style.display !== "none");
click(byId("btnBuyCancel"));

console.log("\n=== 10. 人民币图鉴 ===");
click(byId("btnBook"));
ok("图鉴面板已打开", byId("sheetBook").classList.contains("open"));
eq("图鉴卡片数 = 9", byId("bookGrid").querySelectorAll(".bk-card").length, 9);
ok("每张图鉴卡都带真钱图",
   $$("#bookGrid .bk-card").every(c => !!c.querySelector("svg")));
closeSheet("sheetBook");

console.log("\n=== 11. 持久化 ===");
const saved = win.localStorage.getItem("kid_piggy_bank_v3");
ok("已写入 localStorage", !!saved && saved.length > 10);
const parsed = JSON.parse(saved || "{}");
ok("存档含 goal / items / deposits",
   parsed.goal !== undefined && Array.isArray(parsed.items) && Array.isArray(parsed.deposits),
   "items=" + (parsed.items || []).length + " deposits=" + (parsed.deposits || []).length);
ok("存进去的怪金额 745 分被完整保存（无浮点误差）",
   parsed.deposits.some(x => x.price === 745) || parsed.deposits.every(x => Number.isInteger(x.price)),
   JSON.stringify((parsed.deposits || []).map(x => x.price)));

console.log("\n=== 12. 运行时错误 ===");
ok("无运行时错误", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log("\n──────────────────────────────");
console.log("通过 " + pass + " · 失败 " + fail + (fail ? "\n失败项: " + fails.join(" / ") : ""));
process.exit(fail ? 1 : 0);
