/* TEDUH prototype UI. Uses SYNTHETIC SAMPLE DATA from data/sample_data.js. */
(function () {
  "use strict";
  const D = window.TEDUH_SAMPLE, E = window.TeduhEngine;
  const scores = E.scoreSegments(D);
  const nodeById = Object.fromEntries(D.nodes.map(n => [n.id, n]));
  const segById = Object.fromEntries(D.segments.map(s => [s.id, s]));
  const spByName = Object.fromEntries(D.species.map(s => [s.name, s]));
  const fmtRM = v => "RM" + Math.round(v).toLocaleString("en-MY");
  const pct = v => Math.round(v * 100) + "%";
  const NS = "http://www.w3.org/2000/svg";
  const ICON = { school: "🏫", bus: "🚌", mosque: "🕌", clinic: "🏥", shops: "🛍️", park: "🌳", senior: "👵" };

  // ---------- navigation
  const titles = {
    overview: ["Overview", "Precinct heat-shade status at a glance"],
    map: ["Shade Gap Map", "Where people walk in the sun, ranked by an AI-assisted Shade Gap Score"],
    planner: ["Planting Planner", "Put each new tree where it cools the most people per ringgit"],
    walk: ["Cool Walk", "Resident view: the shadiest route, not just the shortest"],
    care: ["Tree Care", "Resident stewardship keeps young trees alive"],
  };
  function show(view) {
    document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    document.getElementById("viewTitle").textContent = titles[view][0];
    document.getElementById("viewSub").textContent = titles[view][1];
    if (view === "map") drawMap("mapSvg", { mode: "score", click: true });
    if (view === "planner" && !lastPlan) drawMap("planSvg", { mode: "score" });
    if (view === "walk") drawMap("walkSvg", { mode: "canopy" });
  }
  document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));
  window.teduhShow = show; // used by the demo recorder

  // ---------- map drawing
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function canopyColor(c) { // 0 sun -> 1 shade
    const t = Math.min(1, c / 0.7);
    const r = Math.round(234 + (21 - 234) * t), g = Math.round(88 + (128 - 88) * t), b = Math.round(12 + (61 - 12) * t);
    return `rgb(${r},${g},${b})`;
  }
  function drawMap(svgId, opts) {
    const svg = document.getElementById(svgId);
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "-70 -70 1420 900");
    // blocks (houses) as soft rectangles between streets
    const bg = el("g", {}, svg);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      const a = nodeById[`n${r}_${c}`], b = nodeById[`n${r + 1}_${c + 1}`];
      el("rect", { x: a.x + 16, y: a.y + 16, width: b.x - a.x - 32, height: b.y - a.y - 32, rx: 10, fill: "#e3e9e5" }, bg);
    }
    const p = D.park;
    el("rect", { x: p.x0, y: p.y0, width: p.x1 - p.x0, height: p.y1 - p.y0, rx: 26, fill: "#bfe5cc" }, bg);
    el("ellipse", { cx: (p.x0 + p.x1) / 2, cy: (p.y0 + p.y1) / 2 + 20, rx: 70, ry: 40, fill: "#a5d4f0" }, bg);
    const lbl = el("text", { x: (p.x0 + p.x1) / 2, y: p.y0 + 30, "text-anchor": "middle", "font-size": 20, fill: "#2f6b4a", "font-weight": 700 }, bg);
    lbl.textContent = "Precinct park";
    // segments
    const gs = el("g", {}, svg);
    D.segments.forEach(s => {
      const a = nodeById[s.a], b = nodeById[s.b];
      let color = "#9aa8a1", w = 9;
      if (opts.mode === "score") color = E.band(scores[s.id].sgs).color;
      if (opts.mode === "canopy") { color = canopyColor(s.canopy); w = 8; }
      if (opts.mode === "plain") color = "#c5d0ca";
      const line = el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, "stroke-width": w, "stroke-linecap": "round", class: "seg", "data-id": s.id }, gs);
      if (opts.click) line.addEventListener("click", () => selectSeg(s.id));
    });
    // existing trees
    if (opts.trees !== false) {
      const gt = el("g", {}, svg);
      D.trees.forEach(t => el("circle", { cx: t.x, cy: t.y, r: 3 + Math.min(5, t.age_yr * 0.6), fill: "#2f855a", opacity: 0.55 }, gt));
    }
    // destinations
    const gd = el("g", {}, svg);
    D.destinations.forEach(d => {
      const n = nodeById[d.node];
      el("circle", { cx: n.x, cy: n.y, r: 19, fill: "#fff", stroke: "#0f6b4f", "stroke-width": 3 }, gd);
      const t = el("text", { x: n.x, y: n.y + 7, "text-anchor": "middle", "font-size": 20 }, gd);
      t.textContent = ICON[d.type] || "•";
    });
    el("text", { x: 1330, y: 815, "text-anchor": "end", "font-size": 16, fill: "#8a6d1d", "font-weight": 700 }, svg).textContent = "SAMPLE DATA · synthetic layout";
    // scale bar
    el("line", { x1: -40, y1: 815, x2: 120, y2: 815, stroke: "#334", "stroke-width": 3 }, svg);
    el("text", { x: 40, y: 805, "text-anchor": "middle", "font-size": 14, fill: "#334" }, svg).textContent = "≈160 m";
    if (svgId === "mapSvg") drawLegend();
    return svg;
  }
  function drawLegend() {
    document.getElementById("legend").innerHTML = "<b>Shade Gap Score</b>" +
      [["Critical ≥70", "#c2410c"], ["High 45 to 69", "#f59e0b"], ["Moderate 25 to 44", "#facc15"], ["Low <25", "#22c55e"]]
        .map(([l, c]) => `<i style="background:${c}"></i>${l}`).join("") + "<span style='margin-left:12px'>● existing trees</span>";
  }
  function selectSeg(id) {
    const s = segById[id], sc = scores[id], bd = E.band(sc.sgs);
    document.querySelectorAll("#mapSvg .seg").forEach(l => l.setAttribute("stroke-width", l.dataset.id === id ? 16 : 9));
    const near = D.destinations.map(d => ({ d, dist: Math.hypot(nodeById[d.node].x - (nodeById[s.a].x + nodeById[s.b].x) / 2, nodeById[d.node].y - (nodeById[s.a].y + nodeById[s.b].y) / 2) }))
      .sort((a, b) => a.dist - b.dist).slice(0, 3);
    const bar = (name, v, txt) => `<div class="small"><b>${name}</b> <span class="muted">${txt}</span></div><div class="bar"><div style="width:${Math.round(v * 100)}%"></div></div>`;
    document.getElementById("segDetail").innerHTML = `
      <div class="muted small">${s.street} · ${s.id} · ${s.orientation} · ${s.length_m} m</div>
      <div class="big" style="color:${bd.color}">${sc.sgs}<span style="font-size:16px"> / 100</span></div>
      <span class="badge" style="background:${bd.color}">${bd.label} shade gap</span>
      <div style="margin-top:14px">
        ${bar("Heat exposure", sc.heat, `surface ${s.lst_c}°C · canopy ${pct(s.canopy)}`)}
        ${bar("Pedestrian demand", sc.demand, `~${s.walk_counts_sample} walks/day (sample)`)}
        ${bar("Vulnerable users", (sc.vul - 1) / 0.35, s.near_vulnerable ? "near school / clinic / seniors" : "none nearby")}
        ${bar("Orientation", (sc.ori - 1) / 0.15, s.orientation === "E-W" ? "East-west: long sun exposure" : "North-south")}
      </div>
      <div class="small"><b>Walk destinations nearby:</b> ${near.map(n => (ICON[n.d.type] || "") + " " + n.d.name.replace(" (sample)", "")).join(", ")}</div>
      <p class="small muted">Recommendation: ${sc.sgs >= 45 ? "prioritise shade trees on the sun-facing footpath in the next planting cycle." : "monitor; lower priority this cycle."}</p>`;
  }

  // ---------- overview
  function overview() {
    const arr = D.segments.map(s => ({ s, sc: scores[s.id].sgs })).sort((a, b) => b.sc - a.sc);
    const totalLen = D.segments.reduce((a, s) => a + s.length_m, 0);
    const shaded = D.segments.reduce((a, s) => a + s.length_m * s.canopy, 0);
    const crit = arr.filter(x => x.sc >= 45);
    const critLen = crit.reduce((a, x) => a + x.s.length_m, 0);
    const young = D.trees.filter(t => t.age_yr <= 3).length;
    document.getElementById("kpis").innerHTML = [
      ["Footpath shaded (all streets)", pct(shaded / totalLen), ""],
      ["Priority walking streets", (critLen / 1000).toFixed(1) + " km", "hot"],
      ["Hottest segment (surface, simulated)", Math.max(...D.segments.map(s => s.lst_c)).toFixed(1) + "°C", "hot"],
      ["Young trees needing care (≤3 yr)", young, ""],
    ].map(([l, v, c]) => `<div class="kpi ${c}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
    document.getElementById("topGaps").innerHTML = "<tr><th>#</th><th>Street (sample)</th><th>Score</th><th>Canopy</th><th>Surface °C</th><th>Walks/day</th></tr>" +
      arr.slice(0, 8).map((x, i) => {
        const b = E.band(x.sc);
        return `<tr><td>${i + 1}</td><td>${x.s.street} <span class="muted small">${x.s.id}</span></td><td><span class="badge" style="background:${b.color}">${x.sc}</span></td><td>${pct(x.s.canopy)}</td><td>${x.s.lst_c}</td><td>${x.s.walk_counts_sample}</td></tr>`;
      }).join("");
  }

  // ---------- planner
  let lastPlan = null;
  const speciesBox = document.getElementById("speciesBox");
  speciesBox.innerHTML = D.species.map(sp => `<label class="sp"><input type="checkbox" checked value="${sp.name}">${sp.name}${sp.ert ? " <b title='Endangered, Rare & Threatened'>ERT</b>" : ""}</label>`).join("");
  const budget = document.getElementById("budget"), adopt = document.getElementById("adopt");
  budget.oninput = () => (document.getElementById("budgetVal").textContent = fmtRM(+budget.value));
  adopt.oninput = () => (document.getElementById("adoptVal").textContent = adopt.value + "%");
  function runPlan() {
    const species = [...speciesBox.querySelectorAll("input:checked")].map(i => i.value);
    const opts = { budget: +budget.value, adoptRate: +adopt.value / 100, species };
    const r = E.optimisePlanting(D, scores, opts);
    const naive = E.naivePlanting(D, scores, opts);
    lastPlan = r;
    const svg = drawMap("planSvg", { mode: "score" });
    // place new trees along chosen segments
    const g = el("g", {}, svg);
    const bySeg = {};
    r.plan.forEach(p => (bySeg[p.seg] = (bySeg[p.seg] || []).concat(p)));
    Object.entries(bySeg).forEach(([sid, list]) => {
      const s = segById[sid], a = nodeById[s.a], b = nodeById[s.b];
      list.forEach((p, i) => {
        const t = (i + 0.5) / list.length;
        const x = a.x + (b.x - a.x) * t + (s.orientation === "E-W" ? 0 : -9);
        const y = a.y + (b.y - a.y) * t + (s.orientation === "E-W" ? -9 : 0);
        el("circle", { cx: x, cy: y, r: 7, fill: p.ert ? "#7c3aed" : "#0ea5e9", stroke: "#fff", "stroke-width": 2 }, g);
      });
    });
    const bySp = {};
    r.plan.forEach(p => (bySp[p.species] = (bySp[p.species] || 0) + 1));
    document.getElementById("planResult").innerHTML = `
      <h3>Optimised plan · ${fmtRM(r.spent)}</h3>
      <div class="cmp"><div><div class="t">New trees</div><div class="n">${r.trees}</div></div>
      <div><div class="t">Streets improved</div><div class="n">${r.segmentsTouched}</div></div></div>
      <p class="small" style="margin-top:14px"><b>Priority walking streets shaded (year 5, survival-adjusted)</b></p>
      <div class="small">Today <b>${pct(r.prioritySharedBefore)}</b></div><div class="bar"><div style="width:${pct(r.prioritySharedBefore)};background:#9aa8a1"></div></div>
      <div class="small">Count-led plan, same budget <b>${pct(naive.priorityShadedAfter)}</b></div><div class="bar"><div style="width:${pct(naive.priorityShadedAfter)};background:#f59e0b"></div></div>
      <div class="small">TEDUH plan <b>${pct(r.priorityShadedAfter)}</b></div><div class="bar"><div style="width:${pct(r.priorityShadedAfter)}"></div></div>
      <p class="small"><b>Species mix:</b> ${Object.entries(bySp).map(([k, v]) => `${k} ×${v}`).join(", ")}${r.ertTrees ? ` · <span style="color:#7c3aed"><b>${r.ertTrees} ERT natives</b></span>` : ""}</p>
      <p class="small muted">Indicative: dense roadside canopy cut mean radiant temperature by ~18.7°C and PET by ~10.6°C vs unshaded roads in a Kuala Lumpur field study (Zaki et al., 2020). Costs and crown sizes are assumptions to validate with SDP Landscape & TRCRC.</p>
      <p class="small"><span style="color:#0ea5e9">●</span> new tree &nbsp; <span style="color:#7c3aed">●</span> ERT native from Elmina nursery</p>`;
  }
  document.getElementById("runPlan").addEventListener("click", runPlan);
  window.teduhRunPlan = runPlan;

  // ---------- cool walk
  const fromSel = document.getElementById("walkFrom"), toSel = document.getElementById("walkTo");
  const homesOpts = [["n0_8", "Home · Jalan Sampel 1 (NE corner)"], ["n4_4", "Home · Jalan Sampel 5 (centre)"], ["n0_2", "Home · Jalan Sampel 1 (north)"], ["n3_5", "Home · Lorong Sampel 6"]];
  fromSel.innerHTML = homesOpts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  toSel.innerHTML = D.destinations.map(d => `<option value="${d.node}">${ICON[d.type] || ""} ${d.name}</option>`).join("");
  function drawRoute(svg, segs, color, width, dash) {
    const g = el("g", {}, svg);
    segs.forEach(s => {
      const a = nodeById[s.a], b = nodeById[s.b];
      el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, "stroke-width": width, "stroke-linecap": "round", "stroke-dasharray": dash || "", opacity: 0.9 }, g);
    });
  }
  function runWalk() {
    const r = E.routes(D, fromSel.value, toSel.value);
    const svg = drawMap("walkSvg", { mode: "canopy" });
    drawRoute(svg, r.shortest.segs, "#1f2937", 7, "14 10");
    drawRoute(svg, r.cool.segs, "#2563eb", 13);
    const f = nodeById[fromSel.value];
    el("circle", { cx: f.x, cy: f.y, r: 14, fill: "#2563eb", stroke: "#fff", "stroke-width": 4 }, svg);
    const a = r.shortest.stats, c = r.cool.stats;
    const saved = Math.max(0, a.sun_minutes - c.sun_minutes);
    document.getElementById("walkResult").innerHTML = `
      <div class="cmp">
        <div><div class="t">Shortest</div><div class="n">${a.minutes.toFixed(1)} min</div><div class="small">${a.length_m} m · ${pct(a.shaded_share)} shaded</div><div class="small">☀ ${a.sun_minutes.toFixed(1)} min in sun</div></div>
        <div class="cool"><div class="t">TEDUH cool route</div><div class="n">${c.minutes.toFixed(1)} min</div><div class="small">${c.length_m} m · ${pct(c.shaded_share)} shaded</div><div class="small">☀ ${c.sun_minutes.toFixed(1)} min in sun</div></div>
      </div>
      <p class="small" style="margin-top:12px"><b>${saved.toFixed(1)} fewer minutes in direct sun</b> for ${(c.minutes - a.minutes).toFixed(1)} extra minutes of walking.</p>
      <p class="small muted">Blue = cool route · dashed = shortest. Street colour = canopy (orange sunny → green shaded). Simulated data.</p>`;
  }
  document.getElementById("walkGo").addEventListener("click", runWalk);
  window.teduhWalk = (from, to) => { fromSel.value = from; toSel.value = to; runWalk(); };

  // ---------- tree care
  const dry = document.getElementById("dry");
  function care() {
    document.getElementById("dryVal").textContent = dry.value;
    const rows = D.adopted.map(a => {
      const t = D.trees.find(x => x.id === a.tree);
      const risk = E.treeRisk(t, a, +dry.value, spByName[t.species]);
      return { a, t, risk };
    }).sort((x, y) => y.risk - x.risk);
    document.getElementById("careTbl").innerHTML = "<tr><th>Tree</th><th>Species</th><th>Age</th><th>Adopter</th><th>Last check-in</th><th>Risk</th><th>Action</th></tr>" +
      rows.map(({ a, t, risk }) => {
        const c = risk >= 0.65 ? "#c2410c" : risk >= 0.45 ? "#f59e0b" : "#22c55e";
        const act = risk >= 0.65 ? "Water today + nudge adopter" : risk >= 0.45 ? "Water within 2 days" : "OK";
        return `<tr><td>${t.id}</td><td>${t.species}</td><td>${t.age_yr} yr</td><td>${a.adopter.replace(" (sample)", "")}</td><td>${a.last_checkin_days} d ago</td><td><span class="badge" style="background:${c}">${Math.round(risk * 100)}</span></td><td class="small">${act}</td></tr>`;
      }).join("");
  }
  dry.oninput = care;
  const canvas = document.getElementById("photoCanvas"), ctx = canvas.getContext("2d");
  function analyseImage(img, label) {
    const r = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * r, h = img.height * r;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const res = E.analysePixels(px);
    const col = { healthy: "#16a34a", watch: "#f59e0b", stressed: "#c2410c", unclear: "#64748b" }[res.status];
    document.getElementById("photoResult").innerHTML = `<div class="result-box">
      <div class="muted small">${label}</div>
      <div style="font-size:24px;font-weight:800;color:${col};text-transform:capitalize">${res.status}</div>
      <div>Green leaf share: <b>${pct(res.green_share)}</b></div>
      <div>Foliage in frame: <b>${pct(res.foliage_share)}</b></div>
      <div class="small muted" style="margin-top:6px">${res.status === "healthy" ? "Logged ✓ Survival record updated." : res.status === "unclear" ? "Retake closer to the canopy." : "Flagged to landscape team; watering visit scheduled."}</div></div>`;
  }
  function loadSample(src) {
    const img = new Image();
    img.onload = () => analyseImage(img, "Sample photo (illustrative)");
    img.src = src;
  }
  document.querySelectorAll("[data-sample]").forEach(b => b.addEventListener("click", () => loadSample(b.dataset.sample)));
  document.getElementById("photoIn").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.onload = () => analyseImage(img, "Your photo (analysed on device)"); img.src = URL.createObjectURL(f);
  });
  window.teduhPhoto = loadSample;

  overview(); care();
})();
