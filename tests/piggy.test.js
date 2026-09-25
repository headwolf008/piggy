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

console.log("\n=== 1. 结构与真实人民币照片 ===");
["piggyBox", "pigLiquid", "tankWater", "tankPct", "wlSub", "balNum",
 "btnHistory", "histCount", "btnGoal", "btnBook",
 "sheetEdit", "sheetGoal", "sheetBook", "sheetHistory", "historyBox", "histSeg",
 "buyYuan", "buyJiao", "buyFen", "addYuan", "addJiao", "addFen", "editYuan", "editJiao", "editFen",
 "buyClear", "addClear", "editClear", "buyOverTip", "goalChips"].forEach(id =>
  ok("存在 #" + id, !!byId(id)));

const noteImgs = $$("#moneyWrap img");
ok("人民币图标已换成真实照片（内联 data URI）",
   noteImgs.length > 0 && noteImgs.every(i => i.src.indexOf("data:image/jpeg;base64,") === 0),
   "共 " + noteImgs.length + " 张");
ok("页面里已无手绘钞票 symbol",
   html.indexOf('id="bk100"') < 0 && html.indexOf('id="cn100"') < 0 && html.indexOf("#sprite") < 0);
ok("图鉴容器 #bookGrid 存在", !!byId("bookGrid"));

ok("旧的环形进度条已移除", html.indexOf("ring-wrap") < 0 && html.indexOf("ring-fg") < 0);
ok("旧的横向对比条已移除", html.indexOf("cmp-bar") < 0 && html.indexOf("cmp-left") < 0);
ok("旧的「点选金额」实现已彻底移除",
   html.indexOf("YUAN_OPTS") < 0 && html.indexOf("JIAO_OPTS") < 0 &&
   html.indexOf("chipInner") < 0 && html.indexOf("buildPicker") < 0 &&
   html.indexOf('id="chipsYuan"') < 0 && html.indexOf('id="chipsJiao"') < 0);

console.log("\n=== 2. 初始状态 ===");
eq("初始余额 = 200元", balNum(), "200");
eq("一打开就是满的 100%（反向逻辑）", byId("tankPct").textContent.trim(), "100%");
ok("小猪水位已设 transform", /translateY/.test(byId("pigLiquid").style.transform));
eq("「全部记录」笔数徽标 = 0", badge(), "0");

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

console.log("\n=== 8. 满度是反向的：一开始 100%，花钱往下掉 ===");
const pctNow = () => parseFloat(byId("tankPct").textContent);
const lvNum = () => parseFloat(((byId("pigLiquid").style.transform || "").match(/translateY\(([-\d.]+)px\)/) || [0, "NaN"])[1]);

const hH = () => parseFloat(byId("tankWater").style.height) || 0;
const h0 = hH();
click(byId("btnBuy")); typeAmt("buy", 5, 0, 0); click(byId("btnBuyNext")); click(byId("btnConfirmBuy"));
const h1 = hH();
ok("买完东西水位下降", h1 < h0, h0 + "% → " + h1 + "%");
ok("小猪肚子里的水位同步下降", lvNum() > 136 - 96 * h0 / 100 - 0.5,
   byId("pigLiquid").style.transform);

click(byId("btnAdd")); typeAmt("add", 50, 0, 0); click(byId("btnConfirmAdd"));
const h2 = hH();
ok("存钱后水位回升", h2 > h1, h1 + "% → " + h2 + "%");

console.log("\n=== 9. 买东西钱不够时拦截 ===");
click(byId("btnBuy"));
typeAmt("buy", 99999, 9, 9);            // 一个肯定超过余额的金额
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
eq("图鉴卡片数 = 11", byId("bookGrid").querySelectorAll(".bk-card").length, 11);
const bookImgs = $$("#bookGrid .bk-card img");
ok("每张图鉴卡都带真人民币照片",
   $$("#bookGrid .bk-card").length > 0 &&
   $$("#bookGrid .bk-card").every(c => !!c.querySelector("img")) &&
   bookImgs.length > 0 &&
   bookImgs.every(i => String(i.getAttribute("src")).indexOf("data:image/jpeg;base64,") === 0),
   "卡片 " + $$("#bookGrid .bk-card").length + " / 图 " + bookImgs.length +
   " / 首图 " + (bookImgs[0] ? String(bookImgs[0].getAttribute("src")).slice(0, 32) : "无"));
closeSheet("sheetBook");

console.log("\n=== 11. 持久化 ===");
const saved = win.localStorage.getItem("kid_piggy_bank_v3");
ok("已写入 localStorage", !!saved && saved.length > 10);
const parsed = JSON.parse(saved || "{}");
ok("存档含 items / deposits / initial",
   parsed.items !== undefined && Array.isArray(parsed.items) && Array.isArray(parsed.deposits) &&
   parsed.initial !== undefined,
   "items=" + (parsed.items || []).length + " deposits=" + (parsed.deposits || []).length);
ok("存进去的怪金额 745 分被完整保存（无浮点误差）",
   parsed.deposits.some(x => x.price === 745) || parsed.deposits.every(x => Number.isInteger(x.price)),
   JSON.stringify((parsed.deposits || []).map(x => x.price)));

console.log("\n=== 12. 运行时错误 ===");
ok("无运行时错误", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log("\n=== 13. 换个干净的存档：容量决定满度 ===");
{
  const dom2 = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://piggy.local/",
    beforeParse(win) {
      win.HTMLCanvasElement.prototype.getContext = () => null;
      win.confirm = () => true;
      win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    }
  });
  const w2 = dom2.window, d2 = w2.document;
  const b2 = (id) => d2.getElementById(id);
  const cl2 = (el) => el.dispatchEvent(new w2.MouseEvent("click", { bubbles: true }));
  const ty2 = (p, y, j, f) => {
    ["Yuan", "Jiao", "Fen"].forEach((k, i) => {
      const el = b2(p + k); el.value = String([y, j, f][i] === 0 ? "" : [y, j, f][i]);
      el.dispatchEvent(new w2.Event("input", { bubbles: true }));
    });
  };
  const hgt = () => parseFloat(b2("tankWater").style.height) || 0;

  eq("干净存档初始水位 = 100%", b2("tankPct").textContent.trim(), "100%");
  ok("水柱高度 = 100%", Math.abs(hgt() - 100) < 0.01, String(hgt()));
  /* 花掉 50 元 → 只装了 200 元，剩 150 元 = 75% */
  cl2(b2("btnBuy")); ty2("buy", 50, 0, 0); cl2(b2("btnBuyNext")); cl2(b2("btnConfirmBuy"));
  ok("买 50 元后水位 ≈75%", Math.abs(hgt() - 75) < 0.6, String(hgt()));
  eq("余额 = 150 元", b2("balNum").textContent.trim(), "150");
  /* 把容量改成 400 元 → 剩下的 150 元只占 37.5% */
  cl2(b2("btnGoal")); b2("goalInput").value = "400"; cl2(b2("btnGoalSet"));
  ok("容量改 400 元后水位 ≈37.5%", Math.abs(hgt() - 37.5) < 0.6, String(hgt()));
  /* 再买 30 元 → 120/400 = 30% */
  cl2(b2("btnBuy")); ty2("buy", 30, 0, 0); cl2(b2("btnBuyNext")); cl2(b2("btnConfirmBuy"));
  ok("再买 30 元后水位 ≈30%", Math.abs(hgt() - 30) < 0.6, String(hgt()));
  dom2.window.close();
}

console.log("\n=== 14. 老存档迁移：goal 当年是「存钱目标」，读进来要按满度重算 ===");
{
  /* 版本 1 的存档：goal=500元 是「存钱目标」，不是满度。
     如果直接沿用，178 元的余额会显示成 178/500=35.6%；重算成 initial=200元 后应该是 89%。 */
  const legacy = JSON.stringify({
    initial: 20000, added: 0, goal: 50000,
    deposits: [{ id: "d1", price: 1300, img: "", time: "09/25 10:00" }],
    items: [{ id: "i1", price: 3500, img: "", time: "09/25 15:00", kind: "spend" }]
  });
  const dom3 = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://piggy.local/",
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.confirm = () => true;
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      /* beforeParse 早于任何脚本执行，正好模拟「老存档已经在浏览器里」 */
      try { w.localStorage.setItem("kid_piggy_bank_v3", legacy); } catch (e) {}
    }
  });
  const b3 = (id) => dom3.window.document.getElementById(id);
  const hgt3 = () => parseFloat(b3("tankWater").style.height) || 0;

  eq("老存档的余额照旧 = 178 元", b3("balNum").textContent.trim(), "178");
  ok("满度按一开始的基金重算 → 水位 ≈89%", Math.abs(hgt3() - 89) < 0.6, String(hgt3()));
  ok("老存档里的记录没被丢掉（1 存 + 1 花）",
     byId("histCount") && dom3.window.document.getElementById("histCount").textContent === "2",
     dom3.window.document.getElementById("histCount").textContent);
  const saved3 = JSON.parse(dom3.window.localStorage.getItem("kid_piggy_bank_v3") || "{}");
  eq("重新存盘后带上语义版本 sem = 2", saved3.sem, 2);
  dom3.window.close();
}

console.log("\n──────────────────────────────");
console.log("通过 " + pass + " · 失败 " + fail + (fail ? "\n失败项: " + fails.join(" / ") : ""));
process.exit(fail ? 1 : 0);
