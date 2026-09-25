/* jsdom 交互冒烟测试台
   覆盖：
     ① 结构化：关键元素在、已删的（存钱 / 进度条 / 满度面板）真的不存在
     ② 真人民币照片 + 点开可放大（高清版）
     ③ 反向水位：一开始 100%，花掉往下降
     ④ 买东西流程（金额必填、超额拦住）+ 金额自由输入
     ⑤ 记账本：改 / 删 记录
     ⑥ 「新的一期」：本期归档、期数 +1、小猪重新 200 元
     ⑦ 往期分页
     ⑧ 持久化 + 老存档迁移（sem 3）
   跑法：npm test   （或 node tests/piggy.test.js） */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "piggy-bank.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

/* 从小段源码里抠出图片表（显示版 / 高清版）。
   应用代码是 IIFE，局部变量拿不到，所以直接从文本里解析，
   顺便也证明了这两张表真的写进了文件里。 */
function grabImgs(varName) {
  const start = html.indexOf("var " + varName + " = {");
  if (start < 0) return null;
  /* 表可能以 `};` 或 `  };` 收尾 */
  let end = html.indexOf("\n};", start);
  if (end < 0) {
    const re = /\n[ \t]*\};[ \t]*\n/g;
    re.lastIndex = start;
    const m2 = re.exec(html);
    end = m2 ? m2.index : -1;
  }
  if (end < 0) return null;
  const block = html.slice(start, end);
  const out = {};
  const re = /\b(\w+)\s*:\s*"data:image\/[^"]+"/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[0].match(/"data:[^"]+"/)[0].slice(1, -1);
  return out;
}
const RMB = grabImgs("RMB");
const RMB_HD = grabImgs("RMB_HD");

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra ? "  << " + extra : "")); }
}
function eq(name, actual, expect) {
  ok(name + " (= " + expect + ")", String(actual) === String(expect), "实际=" + actual);
}

/* ---------------------------------------------------------------
   建一个独立实例（互不干扰的 localStorage），返回一堆便捷操作
   --------------------------------------------------------------- */
function boot(seed) {
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://piggy.local/",          // 必须：否则 localStorage 抛 DOMException
    beforeParse(win) {
      win.HTMLCanvasElement.prototype.getContext = () => null;
      win.confirm = () => win.__confirmAnswer !== false;
      win.alert = () => {};
      win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      win.addEventListener("error", e => errors.push(String(e.error || e.message)));
      if (seed) { try { win.localStorage.setItem("kid_piggy_bank_v3", seed); } catch (e) {} }
    }
  });
  const win = dom.window, doc = win.document;
  const byId = (id) => doc.getElementById(id);
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => Array.from(doc.querySelectorAll(s));
  const click = (el) => {
    if (!el) throw new Error("click 目标不存在");
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  };
  const setVal = (id, v) => {
    const el = byId(id);
    el.value = v === 0 || v === "" ? "" : String(v);
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  };
  const typeAmt = (prefix, y, j, f) => { setVal(prefix + "Yuan", y); setVal(prefix + "Jiao", j); setVal(prefix + "Fen", f); };
  const balNum = () => byId("balNum").textContent.trim();
  const badge  = () => byId("histCount").textContent.trim();
  const rows   = () => $$("#historyBox .hrow");

  /* 小猪肚子的水位百分比：从 #pigLiquid 的 translateY 反推
     Y = 136 - 96*pct/100 + 5  →  pct = (141 - Y) / 96 * 100 */
  const PIGPCT = () => {
    const m = /translateY\(([-\d.]+)px\)/.exec(byId("pigLiquid").style.transform || "");
    if (!m) return -1;
    return (141 - parseFloat(m[1])) / 96 * 100;
  };

  const buy = (y, j, f) => {
    click(byId("btnBuy"));
    typeAmt("buy", y, j, f);
    click(byId("btnBuyNext"));
    click(byId("btnConfirmBuy"));
  };
  const saved = () => JSON.parse(win.localStorage.getItem("kid_piggy_bank_v3") || "{}");
  return { dom, win, doc, byId, $, $$, click, setVal, typeAmt, balNum, badge, rows, PIGPCT, buy, saved, errors,
           close: () => win.close() };
}

console.log("=== 1. 结构化：该有的在，该删的没了 ===");
{
  const t = boot();
  ["piggyBox","pigLiquid","balNum","balUnit","wlSub","periodTag","histCount","btnHistory",
   "btnBook","btnBuy","btnNew","sheetBuy","sheetHistory","sheetBook","sheetEdit","zoom",
   "zoomImg","zoomTitle","zoomCnt","zoomPrev","zoomNext","zoomIn","zoomOut","zoomClose"].forEach(id => {
    ok("存在 #" + id, !!t.byId(id));
  });
  ["tankWater","tankPct","btnAdd","sheetAdd","addYuan","sheetGoal","goalChips","btnGoal"].forEach(id => {
    ok("已删除 #" + id, !t.byId(id));
  });
  ok("页面里已无 .tank 进度条", !t.$(".tank"));
  ok("页面里已无「存钱」入口文案", html.indexOf(">存钱<") < 0 && html.indexOf("💰 存入多少") < 0);
  ok("脚本里已无存钱金额面板绑定", html.indexOf('"addYuan"') < 0 && html.indexOf("btnConfirmAdd") < 0);
  t.close();
}

console.log("\n=== 2. 真人民币照片（显示版） ===");
{
  const t = boot();
  const imgs = t.$$("#moneyWrap img");
  ok("钱排里的图都是内联真照片", imgs.length > 0 && imgs.every(i => i.src.indexOf("data:image/jpeg;base64,") === 0),
     "共 " + imgs.length + " 张");
  ok("每张图都带 data-k（点开能放大）", imgs.every(i => !!i.dataset.k));
  ok("不再有手绘钞票 symbol", html.indexOf('id="bk100"') < 0 && html.indexOf("#sprite") < 0);
  t.click(t.byId("btnBook"));
  const cards = t.$$("#bookGrid .bk-card");
  eq("图鉴卡片数 = 11", cards.length, 11);
  const bImgs = t.$$("#bookGrid img");
  ok("图鉴每张都有 data-k 且是真照片",
     bImgs.length === 11 && bImgs.every(i => i.dataset.k && i.src.indexOf("data:image/jpeg;base64,") === 0));
  ok("图鉴里都是内联图（不依赖外链）", bImgs.every(i => i.getAttribute("src").length > 500));
  t.close();
}

console.log("\n=== 3. 高清放大版：分辨率必须高于显示版 ===");
{
  ok("文件里写着显示版图片表", !!RMB && Object.keys(RMB).length === 11,
     RMB ? Object.keys(RMB).length + " 张" : "找不到 var RMB");
  ok("文件里写着高清版图片表", !!RMB_HD && Object.keys(RMB_HD).length === 11,
     RMB_HD ? Object.keys(RMB_HD).length + " 张" : "找不到 var RMB_HD");
  const keys = Object.keys(RMB_HD || {});
  const smaller = keys.filter(k => !(RMB_HD[k].length > (RMB[k] || "").length));
  ok("每个面额的高清版都比显示版长（分辨率更高）", smaller.length === 0, "偏小的: " + smaller.join(","));
  const same = keys.filter(k => RMB_HD[k] === RMB[k]);
  ok("高清版和显示版不是同一张图", same.length === 0, "一样的: " + same.join(","));
  const totalHD = keys.reduce((s, k) => s + RMB_HD[k].length, 0);
  const totalD = Object.keys(RMB || {}).reduce((s, k) => s + RMB[k].length, 0);
  ok("高清版总量在 400KB~1.2MB 之间（够清晰又不至于太大）",
     totalHD > 400 * 1024 && totalHD < 1200 * 1024, (totalHD / 1024).toFixed(0) + " KB");
  ok("高清版占了整个文件的一小部分，单文件仍然开得动",
     totalHD / html.length < 0.9, ((totalHD / html.length) * 100).toFixed(0) + "%");
  console.log("       └ 显示版 " + (totalD / 1024).toFixed(0) + " KB → 高清版 " + (totalHD / 1024).toFixed(0) + " KB");
}

console.log("\n=== 4. 点开人民币 → 全屏放大 ===");
{
  const t = boot();
  const firstImg = t.$("#moneyWrap img");
  const k = firstImg.dataset.k;
  t.click(firstImg);
  ok("放大层已打开", t.byId("zoom").classList.contains("open"));
  const hdSrc = t.byId("zoomImg").getAttribute("src");
  ok("用的是高清版大图（且和显示版不是同一张）",
     hdSrc === RMB_HD[k] && hdSrc !== firstImg.getAttribute("src"), k);
  ok("标题写清是什么钱", /元/.test(t.byId("zoomTitle").textContent.trim()), t.byId("zoomTitle").textContent);
  eq("计数从第 1 张开始", t.byId("zoomCnt").textContent.trim(), "1 / 11");

  t.click(t.byId("zoomNext"));
  eq("下一张 → 2 / 11", t.byId("zoomCnt").textContent.trim(), "2 / 11");
  t.click(t.byId("zoomPrev"));
  t.click(t.byId("zoomPrev"));
  eq("上一张可以循环到最后一张", t.byId("zoomCnt").textContent.trim(), "11 / 11");

  t.click(t.byId("zoomIn"));
  ok("点「＋」后图片被放大", /scale\(1\.5\)/.test(t.byId("zoomImg").style.transform), t.byId("zoomImg").style.transform);
  t.click(t.byId("zoomOut"));
  ok("点「－」能缩回 1 倍并居中", /scale\(1\)/.test(t.byId("zoomImg").style.transform), t.byId("zoomImg").style.transform);
  t.click(t.byId("zoomClose"));
  ok("关闭后放大层收起", !t.byId("zoom").classList.contains("open"));

  t.click(t.byId("btnBook"));
  t.click(t.$("#bookGrid img"));
  ok("图鉴里的图也能点开放大", t.byId("zoom").classList.contains("open"));
  ok("点开后标题是这一张的名字", t.byId("zoomTitle").textContent.trim().length > 0, t.byId("zoomTitle").textContent);
  t.close();
}

console.log("\n=== 5. 反向水位：一打开是满的，花掉往下降 ===");
{
  const t = boot();
  eq("初始余额 = 200 元", t.balNum(), "200");
  ok("小猪一开始是满的（100%）", Math.abs(t.PIGPCT() - 100) < 0.01, String(t.PIGPCT()));
  t.buy(50, 0, 0);
  eq("花 50 元后余额 = 150", t.balNum(), "150");
  ok("水位掉到 75%", Math.abs(t.PIGPCT() - 75) < 0.6, String(t.PIGPCT()));
  t.buy(150, 0, 0);
  eq("再花 150 元余额 = 0", t.balNum(), "0");
  ok("水位到 0%（一滴不剩）", Math.abs(t.PIGPCT()) < 0.01, String(t.PIGPCT()));
  eq("归零时单位显示「元」不是「分」", t.byId("balUnit").textContent.trim(), "元");
  t.close();
}

console.log("\n=== 6. 买东西：金额必填、花超了拦住 ===");
{
  const t = boot();
  t.buy(0, 0, 0);
  eq("金额空着买不成", t.badge(), "0");
  t.buy(201, 0, 0);
  eq("余额不足买不成", t.badge(), "0");
  eq("余额还是 200 元", t.balNum(), "200");
  t.buy(200, 0, 0);
  eq("正好花光可以", t.badge(), "1");
  eq("余额 = 0 元", t.balNum(), "0");
  t.close();
}

console.log("\n=== 7. 金额自由输入：元 / 角 / 分 任意组合 ===");
{
  const t = boot();
  t.buy(12, 3, 5);
  eq("12元3角5分 → 还剩 187 元", t.balNum(), "187");
  eq("单位「元」", t.byId("balUnit").textContent.trim(), "元");
  t.buy(0, 0, 5);
  eq("再花 5 分 → 还剩 187 元（187.30）", t.balNum(), "187");
  t.close();
}

console.log("\n=== 8. 记账本：改 / 删 ===");
{
  const t = boot();
  t.buy(30, 0, 0);
  t.buy(20, 0, 0);
  eq("记录数 = 2", t.badge(), "2");
  t.click(t.byId("btnHistory"));
  eq("清单里有 2 行", t.rows().length, 2);
  ok("汇总里写着还剩多少", /还剩/.test(t.byId("historyBox").textContent));

  t.win.confirm = () => true;
  t.click(t.rows()[0].querySelector(".dl"));
  eq("删掉最新一条（20元）→ 余额 170", t.balNum(), "170");
  eq("记录数 = 1", t.badge(), "1");

  t.click(t.rows()[0].querySelector(".ed"));
  ok("打开修改面板", t.byId("sheetEdit").classList.contains("open"));
  t.typeAmt("edit", 5, 0, 0);
  t.click(t.byId("btnEditSave"));
  eq("把 30 元改成 5 元 → 余额 195", t.balNum(), "195");
  t.close();
}

console.log("\n=== 9. 新的一期：本期归档、期数 +1、重新 200 元 ===");
{
  const t = boot();
  eq("初始是第 1 期", t.byId("periodTag").textContent.trim(), "第 1 期");
  t.buy(40, 0, 0);
  t.buy(10, 0, 0);
  eq("花掉 50 元后余额 150", t.balNum(), "150");
  eq("记录 2 笔", t.badge(), "2");

  t.win.confirm = () => true;
  t.click(t.byId("btnNew"));
  eq("期数变成第 2 期", t.byId("periodTag").textContent.trim(), "第 2 期");
  eq("余额回到 200 元", t.balNum(), "200");
  ok("小猪重新满上（100%）", Math.abs(t.PIGPCT() - 100) < 0.01, String(t.PIGPCT()));
  eq("本期记录清空", t.badge(), "0");

  const s = t.saved();
  eq("存档里期数 = 2", s.period, 2);
  eq("往期归档 1 期", s.periods.length, 1);
  eq("归档的那期保存了 2 笔", s.periods[0].items.length, 2);

  t.click(t.byId("btnHistory"));
  const pastBtn = t.$$("#histSeg button").find(b => b.dataset.tab === "past");
  ok("有「往期」分页", !!pastBtn);
  t.click(pastBtn);
  ok("往期里能看到第 1 期", /第 1 期/.test(t.byId("historyBox").textContent), t.byId("historyBox").textContent.slice(0, 80));
  ok("往期汇总写着累计花掉 50 元", /50元/.test(t.byId("historyBox").textContent));
  const card = t.$("#historyBox .pcard");
  ok("往期卡片默认收起", card && !card.classList.contains("open"));
  t.click(card.querySelector(".ph"));
  ok("点一下能展开明细", card.classList.contains("open"));
  eq("明细里 2 行", t.$$("#historyBox .prow").length, 2);

  // 空的一期不重复归档
  t.click(card.querySelector(".ph"));
  t.click(t.byId("btnNew"));
  eq("第三期", t.byId("periodTag").textContent.trim(), "第 3 期");
  eq("空的这一期不进往期（仍是 1 期）", t.saved().periods.length, 1);
  t.close();
}

console.log("\n=== 10. 取消「新的一期」不丢数据 ===");
{
  const t = boot();
  t.buy(25, 0, 0);
  t.win.confirm = () => false;
  t.click(t.byId("btnNew"));
  eq("取消后还在第 1 期", t.byId("periodTag").textContent.trim(), "第 1 期");
  eq("余额不变", t.balNum(), "175");
  eq("记录还在", t.badge(), "1");
  t.close();
}

console.log("\n=== 11. 持久化：刷新后还在 ===");
{
  const t = boot();
  t.buy(66, 0, 0);
  const dump = t.win.localStorage.getItem("kid_piggy_bank_v3");
  const t2 = boot(dump);
  eq("重新打开余额还是 134", t2.balNum(), "134");
  eq("语义版本 sem = 3", t2.saved().sem, 3);
  t.close(); t2.close();
}

console.log("\n=== 12. 老存档迁移（sem 1 / sem 2 → 3） ===");
{
  // sem 1：当年 goal 是「存钱目标」，还带着一笔存钱记录
  const legacy = JSON.stringify({
    sem: 1, initial: 20000, added: 0, goal: 50000,
    deposits: [{ id: "d1", price: 5000, img: "", time: "09/20 10:00" }],
    items: [{ id: "i1", price: 3500, img: "", time: "09/20 15:00", kind: "spend" }]
  });
  const t = boot(legacy);
  eq("旧「存钱」的钱折进基金：200+50-35 = 215 元", t.balNum(), "215");
  // 折进来之后基金 = 200+50 = 250 元，满度也跟着变成 250，花掉的 35 元照扣 → 215/250 = 86%
  ok("满度 = 折进后的基金 250 元，水位 = 215/250 = 86%",
     Math.abs(t.PIGPCT() - 86) < 0.6, String(t.PIGPCT()));
  eq("存档里的满度就是基金", t.saved().goal, 25000);
  eq("旧的存钱记录不再算本期记录", t.badge(), "1");
  eq("迁移后语义版本 = 3", t.saved().sem, 3);
  ok("存档里不再写 deposits", t.saved().deposits === undefined, JSON.stringify(t.saved().deposits));
  t.close();

  // sem 2：余额比 200 少一丁点 → 水位不能超过 100%
  const legacy2 = JSON.stringify({
    sem: 2, initial: 20000, added: 0, goal: 20000, deposits: [],
    items: [{ id: "i1", price: 100, img: "", time: "09/20 15:00", kind: "spend" }]
  });
  const t2 = boot(legacy2);
  eq("sem2 的存档余额 = 199 元", t2.balNum(), "199");
  ok("水位 ≈99.5%", Math.abs(t2.PIGPCT() - 99.5) < 0.6, String(t2.PIGPCT()));
  t2.close();
}

console.log("\n=== 13. 运行期没有 JS 报错 / 空引用 ===");
{
  const t = boot();
  t.buy(10, 0, 0);
  t.click(t.byId("btnHistory"));
  t.click(t.byId("btnBook"));
  t.click(t.byId("btnNew"));
  t.click(t.$("#moneyWrap img"));
  t.click(t.byId("zoomClose"));
  t.click(t.byId("piggyBox"));
  ok("全程没有未捕获错误", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  t.close();
}

console.log("\n──────────────────────────────");
console.log("通过 " + pass + " · 失败 " + fail + (fail ? "\n失败项: " + fails.join(" / ") : ""));
process.exit(fail ? 1 : 0);
