// Run: node tests/engine.test.js
const assert = require("assert");
global.window = {};
require("../data/sample_data.js");
const data = global.window.TEDUH_SAMPLE;
const E = require("../engine.js");
const sc = E.scoreSegments(data);
const vals = Object.values(sc).map(v => v.sgs);
assert.strictEqual(Math.max(...vals), 100); assert.strictEqual(Math.min(...vals), 0);
const opt = E.optimisePlanting(data, sc, { budget: 150000 });
assert(opt.spent <= 150000, "budget respected");
assert(opt.priorityShadedAfter > opt.prioritySharedBefore, "shade improves");
const naive = E.naivePlanting(data, sc, { budget: 150000 });
assert(opt.priorityShadedAfter > naive.priorityShadedAfter, "targeted beats count-led");
const r = E.routes(data, "n0_0", "n4_1");
assert(r.cool.stats.sun_m <= r.shortest.stats.sun_m, "cool route has less sun");
const px = new Uint8ClampedArray([30,140,40,255, 35,150,45,255, 160,120,60,255]);
assert(["healthy","watch","stressed","unclear"].includes(E.analysePixels(px).status));
console.log("All engine tests passed.",
  { trees: opt.trees, before: opt.prioritySharedBefore.toFixed(2), after: opt.priorityShadedAfter.toFixed(2), naive: naive.priorityShadedAfter.toFixed(2),
    shortest: r.shortest.stats, cool: r.cool.stats });
