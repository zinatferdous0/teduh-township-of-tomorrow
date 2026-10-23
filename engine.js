/* TEDUH engine: scoring, planting optimiser, cool-route search, tree-care risk,
 * and photo canopy-health check. Pure functions; runs in the browser and in Node
 * (see tests/engine.test.js). All inputs in this prototype are SYNTHETIC SAMPLE DATA. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TeduhEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- 1. Shade Gap Score --------------------------------------------------
  // SGS = HeatExposure x PedestrianDemand x Vulnerability x Orientation, scaled 0-100.
  // Orientation weight reflects field evidence from Kuala Lumpur that roadside
  // trees give larger PET reductions on E-W roads (Zaki et al., 2020, Sustainability 12(3):1053).
  const W = { ew: 1.15, ns: 1.0, vulnerable: 1.35 };

  function minmax(arr) {
    let lo = Infinity, hi = -Infinity;
    arr.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    return v => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  }

  function scoreSegments(data) {
    const nLst = minmax(data.segments.map(s => s.lst_c));
    const nDem = minmax(data.segments.map(s => s.demand_raw));
    const raw = data.segments.map(s => {
      const heat = (0.35 + 0.65 * nLst(s.lst_c)) * (1 - s.canopy);
      const demand = 0.15 + 0.85 * nDem(s.demand_raw);
      const vul = s.near_vulnerable ? W.vulnerable : 1;
      const ori = s.orientation === "E-W" ? W.ew : W.ns;
      return { id: s.id, heat, demand, vul, ori, raw: heat * demand * vul * ori };
    });
    const nRaw = minmax(raw.map(r => r.raw));
    const out = {};
    raw.forEach(r => {
      out[r.id] = { sgs: Math.round(100 * nRaw(r.raw)), heat: r.heat, demand: r.demand, vul: r.vul, ori: r.ori };
    });
    return out;
  }

  function band(sgs) {
    if (sgs >= 70) return { label: "Critical", color: "#c2410c" };
    if (sgs >= 45) return { label: "High", color: "#f59e0b" };
    if (sgs >= 25) return { label: "Moderate", color: "#facc15" };
    return { label: "Low", color: "#22c55e" };
  }

  // ---- 2. Planting optimiser ----------------------------------------------
  // Greedy knapsack on benefit/cost. Benefit = newly shaded metres (year-5 crown)
  // x Shade Gap Score x expected survival. Survival improves with drought
  // tolerance and with an adopter (resident stewardship).
  function optimisePlanting(data, scores, opts) {
    const budget = opts.budget;            // RM
    const careCost = opts.careCostPerTree || 450; // RM, 3-yr watering/inspection (assumption)
    const adoptRate = opts.adoptRate == null ? 0.5 : opts.adoptRate;
    const allowed = data.species.filter(sp => !opts.species || opts.species.includes(sp.name));
    const candidates = [];
    data.segments.forEach(s => {
      const sc = scores[s.id].sgs;
      if (sc < 15) return;
      const gapM = s.length_m * (1 - s.canopy);           // unshaded metres on this segment
      allowed.forEach(sp => {
        const surv = Math.min(0.97, 0.78 + 0.15 * sp.drought_tol + 0.06 * adoptRate);
        candidates.push({ seg: s.id, sp, sc, gapM, surv });
      });
    });
    // iterative greedy with diminishing returns per segment
    const shadedAdded = {}; const plan = []; let spent = 0;
    const segById = Object.fromEntries(data.segments.map(s => [s.id, s]));
    for (let guard = 0; guard < 2000; guard++) {
      let best = null, bestRatio = 0;
      const spCount = {};
      plan.forEach(p => (spCount[p.species] = (spCount[p.species] || 0) + 1));
      const cap = Math.max(3, Math.ceil(0.34 * (plan.length + 1))); // species diversity cap
      for (const c of candidates) {
        if (allowed.length > 2 && (spCount[c.sp.name] || 0) >= cap) continue;
        const remaining = c.gapM - (shadedAdded[c.seg] || 0);
        if (remaining < 2) continue;
        const gain = Math.min(c.sp.crown_5y_m, remaining);
        const cost = c.sp.cost_rm + careCost;
        if (spent + cost > budget) continue;
        const ratio = (gain * c.sc * c.surv * (c.sp.ert ? 1.15 : 1)) / cost; // biodiversity uplift for ERT natives
        if (ratio > bestRatio) { bestRatio = ratio; best = { ...c, gain, cost }; }
      }
      if (!best) break;
      shadedAdded[best.seg] = (shadedAdded[best.seg] || 0) + best.gain;
      spent += best.cost;
      const s = segById[best.seg];
      const idx = plan.filter(p => p.seg === best.seg).length;
      plan.push({ seg: best.seg, species: best.sp.name, latin: best.sp.latin, ert: !!best.sp.ert,
                  cost: best.cost, shade_m: best.gain, survival: best.surv, slot: idx, street: s.street, sgs: best.sc });
    }
    // KPI: share of priority-walk metres (SGS>=45 segments) shaded, before vs year 5
    const prio = data.segments.filter(s => scores[s.id].sgs >= 45);
    const prioLen = prio.reduce((a, s) => a + s.length_m, 0);
    const before = prio.reduce((a, s) => a + s.length_m * s.canopy, 0);
    const after = prio.reduce((a, s) => a + Math.min(s.length_m, s.length_m * s.canopy + (shadedAdded[s.id] || 0) * expectedSurv(plan, s.id)), 0);
    const shadedTotal = plan.reduce((a, p) => a + p.shade_m * p.survival, 0);
    // naive "count-based" plan for comparison: same budget spread evenly by length
    return {
      plan, spent, trees: plan.length,
      prioritySharedBefore: prioLen ? before / prioLen : 0,
      priorityShadedAfter: prioLen ? after / prioLen : 0,
      priorityLen: prioLen, newShadedMetres: shadedTotal,
      segmentsTouched: Object.keys(shadedAdded).length,
      ertTrees: plan.filter(p => p.ert).length,
    };
  }
  function expectedSurv(plan, segId) {
    const ps = plan.filter(p => p.seg === segId);
    if (!ps.length) return 1;
    return ps.reduce((a, p) => a + p.survival, 0) / ps.length;
  }

  // Baseline for comparison: same budget, trees spread by street length (count-led).
  function naivePlanting(data, scores, opts) {
    const careCost = opts.careCostPerTree || 450;
    const sp = data.species[0];
    const per = sp.cost_rm + careCost;
    const n = Math.floor(opts.budget / per);
    const totalLen = data.segments.reduce((a, s) => a + s.length_m, 0);
    const prio = data.segments.filter(s => scores[s.id].sgs >= 45);
    const prioLen = prio.reduce((a, s) => a + s.length_m, 0);
    let after = 0;
    prio.forEach(s => {
      const nt = n * s.length_m / totalLen;
      after += Math.min(s.length_m, s.length_m * s.canopy + nt * sp.crown_5y_m * 0.85);
    });
    return { trees: n, priorityShadedAfter: prioLen ? after / prioLen : 0 };
  }

  // ---- 3. Cool Walk routing -------------------------------------------------
  function buildGraph(data) {
    const g = {};
    data.nodes.forEach(n => (g[n.id] = []));
    data.segments.forEach(s => {
      g[s.a].push({ to: s.b, seg: s });
      g[s.b].push({ to: s.a, seg: s });
    });
    return g;
  }
  function dijkstra(data, from, to, costFn) {
    const g = buildGraph(data);
    const dist = {}, prev = {}, done = new Set();
    Object.keys(g).forEach(k => (dist[k] = Infinity));
    dist[from] = 0;
    while (true) {
      let u = null, best = Infinity;
      for (const k in dist) if (!done.has(k) && dist[k] < best) { best = dist[k]; u = k; }
      if (u === null || u === to) break;
      done.add(u);
      for (const e of g[u]) {
        const alt = dist[u] + costFn(e.seg);
        if (alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = { node: u, seg: e.seg }; }
      }
    }
    const segs = []; let cur = to;
    while (prev[cur]) { segs.unshift(prev[cur].seg); cur = prev[cur].node; }
    return segs;
  }
  function routeStats(segs, walkSpeed) {
    const v = walkSpeed || 1.2; // m/s
    const len = segs.reduce((a, s) => a + s.length_m, 0);
    const sunM = segs.reduce((a, s) => a + s.length_m * (1 - s.canopy), 0);
    const meanLst = len ? segs.reduce((a, s) => a + s.lst_c * s.length_m, 0) / len : 0;
    return { length_m: Math.round(len), minutes: len / v / 60, sun_m: Math.round(sunM),
             sun_minutes: sunM / v / 60, shaded_share: len ? 1 - sunM / len : 0, mean_lst: meanLst };
  }
  function routes(data, from, to, heatAversion) {
    const a = heatAversion == null ? 2.2 : heatAversion;
    const shortest = dijkstra(data, from, to, s => s.length_m);
    const cool = dijkstra(data, from, to, s => s.length_m * (1 + a * (1 - s.canopy) * ((s.lst_c - 30) / 10)));
    return { shortest: { segs: shortest, stats: routeStats(shortest) }, cool: { segs: cool, stats: routeStats(cool) } };
  }

  // ---- 4. Tree-care risk ---------------------------------------------------
  // Young trees (<= 5 yr) carry the highest mortality in the literature
  // (Hilbert et al., 2019). Risk rises with dry days and missed check-ins.
  function treeRisk(tree, rec, dryDays, species) {
    const tol = species ? species.drought_tol : 0.6;
    let r = 0.15;
    if (tree.age_yr <= 2) r += 0.25; else if (tree.age_yr <= 5) r += 0.12;
    r += Math.min(0.35, dryDays * 0.03) * (1.2 - tol);
    if (rec) {
      r += Math.min(0.25, rec.last_checkin_days * 0.012);
      if (rec.last_status === "stressed") r += 0.2;
    } else r += 0.15;
    return Math.max(0, Math.min(1, r));
  }

  // ---- 5. Photo canopy check (on-device) ----------------------------------
  // Excess-Green index (ExG = 2g - r - b on chromatic coordinates) and a
  // yellow/brown leaf ratio. A transparent baseline; in the pilot this is
  // replaced by a model fine-tuned on labelled Elmina tree photos.
  function analysePixels(rgba) {
    let green = 0, brown = 0, n = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const R = rgba[i], G = rgba[i + 1], B = rgba[i + 2];
      n++;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
      if (mx < 40 || d < 25) continue;               // too dark / grey: not foliage
      let h;
      if (mx === R) h = 60 * (((G - B) / d) % 6);
      else if (mx === G) h = 60 * ((B - R) / d + 2);
      else h = 60 * ((R - G) / d + 4);
      if (h < 0) h += 360;
      const s = R + G + B + 1e-6, exg = 2 * (G / s) - R / s - B / s; // Excess-Green index
      if (h >= 75 && h <= 170 && exg > 0.05) green++;                 // green leaves
      else if (h >= 15 && h < 75) brown++;                            // yellow / brown leaves
    }
    const plant = green + brown;
    const greenShare = plant ? green / plant : 0;
    const status = plant / n < 0.05 ? "unclear" : greenShare >= 0.7 ? "healthy" : greenShare >= 0.45 ? "watch" : "stressed";
    return { foliage_share: plant / n, green_share: greenShare, status };
  }

  return { scoreSegments, band, optimisePlanting, naivePlanting, routes, routeStats, treeRisk, analysePixels };
});
