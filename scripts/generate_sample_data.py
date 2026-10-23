#!/usr/bin/env python3
"""Generate the SYNTHETIC sample precinct used by the TEDUH prototype.

Everything produced here is SAMPLE DATA for demonstration only. It is a made-up
street layout "inspired by" a typical new Malaysian township precinct. It is NOT
a survey of City of Elmina or any real place, and the temperatures, canopy and
footfall values are simulated. In a pilot these come from Landsat Collection 2
surface temperature, a canopy layer and real pedestrian counts (see README).

Output: data/sample_data.js  (window.TEDUH_SAMPLE = {...})
"""
import json, math, random, pathlib

random.seed(2026)
COLS, ROWS = 9, 6          # street grid nodes
SP_X, SP_Y = 160, 150      # metres between nodes (approx.)

nodes = []
for r in range(ROWS):
    for c in range(COLS):
        jx = random.uniform(-14, 14) if 0 < c < COLS - 1 else 0
        jy = random.uniform(-12, 12) if 0 < r < ROWS - 1 else 0
        nodes.append({"id": f"n{r}_{c}", "x": round(c * SP_X + jx, 1), "y": round(r * SP_Y + jy, 1)})
nid = {n["id"]: n for n in nodes}

# A park block (no internal streets) and a lake polygon, for map context
PARK = {"c0": 5, "c1": 7, "r0": 1, "r1": 3}

def in_park(r, c):
    return PARK["r0"] < r < PARK["r1"] and PARK["c0"] < c < PARK["c1"]

destinations = [
    {"id": "school", "name": "Sekolah Kebangsaan (sample)", "type": "school", "node": "n4_1", "weight": 1.0, "vulnerable": True},
    {"id": "bus1", "name": "Feeder bus stop A (sample)", "type": "bus", "node": "n5_4", "weight": 0.8, "vulnerable": False},
    {"id": "bus2", "name": "Feeder bus stop B (sample)", "type": "bus", "node": "n0_7", "weight": 0.6, "vulnerable": False},
    {"id": "mosque", "name": "Surau / mosque (sample)", "type": "mosque", "node": "n2_3", "weight": 0.7, "vulnerable": False},
    {"id": "clinic", "name": "Klinik (sample)", "type": "clinic", "node": "n1_1", "weight": 0.6, "vulnerable": True},
    {"id": "shops", "name": "Neighbourhood shops (sample)", "type": "shops", "node": "n3_8", "weight": 0.8, "vulnerable": False},
    {"id": "park", "name": "Precinct park (sample)", "type": "park", "node": "n2_6", "weight": 0.7, "vulnerable": False},
    {"id": "senior", "name": "Senior activity centre (sample)", "type": "senior", "node": "n5_7", "weight": 0.5, "vulnerable": True},
]
homes = [f"n{r}_{c}" for r in range(ROWS) for c in range(COLS)]

def dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])

segments = []
def add_seg(a, b, r, c, horiz):
    A, B = nid[a], nid[b]
    mx, my = (A["x"] + B["x"]) / 2, (A["y"] + B["y"]) / 2
    # simulated canopy: older boulevard on row 0, younger planting elsewhere
    base = 0.55 if r == 0 else (0.45 if c in (0,) and not horiz else 0.18)
    canopy = max(0.02, min(0.85, random.gauss(base, 0.12)))
    # simulated surface temp (deg C): hotter where canopy is low, cooler near park
    near_park = math.hypot(mx - 6 * SP_X, my - 2 * SP_Y) < 260
    lst = 33.0 + (1 - canopy) * 9.5 + random.gauss(0, 0.8) - (2.2 if near_park else 0)
    segments.append({
        "id": f"s{len(segments)+1:03d}", "a": a, "b": b,
        "length_m": round(dist(A, B)), "orientation": "E-W" if horiz else "N-S",
        "canopy": round(canopy, 2), "lst_c": round(lst, 1),
        "street": (f"Jalan Sampel {r+1}" if horiz else f"Lorong Sampel {c+1}"),
    })

for r in range(ROWS):
    for c in range(COLS):
        if c < COLS - 1 and not (in_park(r, c) or in_park(r, c + 1)):
            add_seg(f"n{r}_{c}", f"n{r}_{c+1}", r, c, True)
        if r < ROWS - 1 and not (in_park(r, c) or in_park(r + 1, c)):
            add_seg(f"n{r}_{c}", f"n{r+1}_{c}", r, c, False)

# pedestrian demand: gravity model from destinations (placeholder for the ML
# footfall model trained on real counts in a pilot)
for s in segments:
    A, B = nid[s["a"]], nid[s["b"]]
    m = {"x": (A["x"] + B["x"]) / 2, "y": (A["y"] + B["y"]) / 2}
    d = 0.0
    vul = False
    for t in destinations:
        dd = dist(m, nid[t["node"]])
        d += t["weight"] * math.exp(-dd / 380)
        if t["vulnerable"] and dd < 320:
            vul = True
    s["demand_raw"] = d
    s["near_vulnerable"] = vul
    s["walk_counts_sample"] = int(40 + d * 260 + random.uniform(-20, 20))

# existing trees (sample) along segments
trees = []
species_existing = ["Angsana", "Tampoi", "Penaga Lilin", "Merawan Siput Jantan"]
tid = 1
for s in segments:
    A, B = nid[s["a"]], nid[s["b"]]
    n_tr = int(s["canopy"] * s["length_m"] / 14)
    for i in range(n_tr):
        t = (i + 0.5) / max(n_tr, 1)
        off = 7 if s["orientation"] == "E-W" else 7
        x = A["x"] + (B["x"] - A["x"]) * t + (0 if s["orientation"] == "E-W" else off)
        y = A["y"] + (B["y"] - A["y"]) * t + (off if s["orientation"] == "E-W" else 0)
        age = random.choice([1, 2, 2, 3, 4, 6, 8, 10])
        trees.append({"id": f"T{tid:04d}", "seg": s["id"], "x": round(x, 1), "y": round(y, 1),
                      "species": random.choice(species_existing), "age_yr": age})
        tid += 1

# adopt-a-tree sample records (young trees that need care)
young = [t for t in trees if t["age_yr"] <= 3]
random.shuffle(young)
adopted = []
names = ["Household A", "Household B", "Household C", "Household D", "Household E",
         "Household F", "Household G", "Household H", "Household I", "Household J"]
for i, t in enumerate(young[:10]):
    adopted.append({"tree": t["id"], "adopter": names[i] + " (sample)",
                    "last_checkin_days": random.choice([1, 2, 4, 6, 9, 12, 15, 21]),
                    "last_status": random.choice(["healthy", "healthy", "healthy", "stressed"])})

species_catalog = [
    # indicative values for the demo; to be validated with SDP landscape team / TRCRC
    {"name": "Angsana", "latin": "Pterocarpus indicus", "crown_5y_m": 7.0, "cost_rm": 900, "drought_tol": 0.7, "native": True},
    {"name": "Tampoi", "latin": "Baccaurea macrocarpa", "crown_5y_m": 5.0, "cost_rm": 1100, "drought_tol": 0.5, "native": True, "ert": True},
    {"name": "Penaga Lilin", "latin": "Mesua ferrea", "crown_5y_m": 4.5, "cost_rm": 1000, "drought_tol": 0.6, "native": True},
    {"name": "Merawan Siput Jantan", "latin": "Hopea odorata", "crown_5y_m": 6.0, "cost_rm": 1200, "drought_tol": 0.65, "native": True},
    {"name": "Tiup-tiup", "latin": "Adinandra dumosa", "crown_5y_m": 3.5, "cost_rm": 800, "drought_tol": 0.8, "native": True, "ert": True},
]

out = {
    "meta": {
        "label": "SYNTHETIC SAMPLE PRECINCT, not real survey data",
        "generated_by": "scripts/generate_sample_data.py (seed 2026)",
        "units": {"length": "m", "lst": "deg C (simulated land-surface temperature)", "cost": "RM (indicative assumption)"},
    },
    "nodes": nodes, "segments": segments, "destinations": destinations, "trees": trees,
    "adopted": adopted, "species": species_catalog,
    "park": {"x0": PARK["c0"] * SP_X + 20, "y0": PARK["r0"] * SP_Y + 20,
             "x1": PARK["c1"] * SP_X - 20, "y1": PARK["r1"] * SP_Y - 20},
}
p = pathlib.Path(__file__).resolve().parent.parent / "data" / "sample_data.js"
p.write_text("// AUTO-GENERATED SYNTHETIC SAMPLE DATA. See scripts/generate_sample_data.py\nwindow.TEDUH_SAMPLE = " + json.dumps(out) + ";\n")
print("segments", len(segments), "trees", len(trees), "adopted", len(adopted), "->", p)
