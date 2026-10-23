#!/usr/bin/env python3
"""Pilot data step 1 (real, public data): list Landsat Collection 2 Level-2
Surface Temperature scenes covering a township bounding box via the USGS
LandsatLook STAC API (https://www.usgs.gov/landsat-missions/spatiotemporal-asset-catalog-stac).

This only lists scene metadata (no download, no login). In the pilot the ST_B10
band of low-cloud scenes is downloaded and converted with the USGS scale factor
ST(K) = DN * 0.00341802 + 149.0, then averaged per street segment.

Usage: python3 scripts/fetch_landsat_scenes.py [--bbox minlon,minlat,maxlon,maxlat] [--max-cloud 30]
Default bbox is an APPROXIMATE box around the City of Elmina area, Shah Alam
(to be replaced with the agreed pilot precinct boundary).
"""
import argparse, json, urllib.request

STAC = "https://landsatlook.usgs.gov/stac-server/search"
ap = argparse.ArgumentParser()
ap.add_argument("--bbox", default="101.44,3.14,101.53,3.22")
ap.add_argument("--start", default="2024-01-01")
ap.add_argument("--end", default="2026-10-01")
ap.add_argument("--max-cloud", type=float, default=30)
ap.add_argument("--limit", type=int, default=100)
a = ap.parse_args()
body = {
    "collections": ["landsat-c2l2-st"],
    "bbox": [float(v) for v in a.bbox.split(",")],
    "datetime": f"{a.start}T00:00:00Z/{a.end}T23:59:59Z",
    "limit": a.limit,
}
req = urllib.request.Request(STAC, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=60) as r:
    res = json.load(r)
feats = res.get("features", [])
ok = [f for f in feats if (f["properties"].get("eo:cloud_cover") or 100) <= a.max_cloud]
print(f"{len(feats)} scenes returned; {len(ok)} with cloud cover <= {a.max_cloud}%")
for f in sorted(ok, key=lambda f: f["properties"]["datetime"]):
    p = f["properties"]
    print(f'{p["datetime"][:10]}  {f["id"]:<45} cloud={p.get("eo:cloud_cover")}%  ST asset={"lwir11" in f.get("assets", {})}')
