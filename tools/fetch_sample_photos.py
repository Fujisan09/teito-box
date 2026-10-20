#!/usr/bin/env python3
"""Collect candidate photos for the trial's sample items from Wikimedia Commons.

Runs on GitHub Actions (the sandbox that edits this repo cannot reach Wikimedia).
Writes candidates/<item>/<n>.jpg plus candidates/manifest.json with license/author
for attribution. Only freely licensed JPEGs are kept.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

CFG = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
UA = "TEITO-BOX-sample-photos/1.0 (https://github.com/Fujisan09/teito-box; contact via GitHub)"
API = "https://commons.wikimedia.org/w/api.php"
os.makedirs(OUT, exist_ok=True)

def api(params):
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def strip(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()

def license_ok(name):
    n = (name or "").strip()
    return any(n.upper().startswith(a.upper()) for a in CFG["allowed_licenses"])

manifest = []
for item in CFG["items"]:
    seen, picked = set(), []
    for query in item["queries"]:
        if len(picked) >= CFG["per_query"] * 2:
            break
        try:
            data = api({"action": "query", "generator": "search", "gsrsearch": f"{query} filemime:image/jpeg",
                        "gsrnamespace": "6", "gsrlimit": "10", "prop": "imageinfo",
                        "iiprop": "url|size|mime|extmetadata", "iiurlwidth": str(CFG["thumb_width"]),
                        "iiextmetadatafilter": "LicenseShortName|Artist|ImageDescription|Credit|Categories"})
        except Exception as e:
            print("search failed", query, e); continue
        for p in sorted(data.get("query", {}).get("pages", []), key=lambda p: p.get("index", 0)):
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})
            lic = md.get("LicenseShortName", {}).get("value", "")
            if p["title"] in seen or ii.get("mime") != "image/jpeg" or not license_ok(lic):
                continue
            if ii.get("width", 0) < 800 or ii.get("height", 0) < 500:
                continue
            seen.add(p["title"])
            n = len(picked) + 1
            dest = os.path.join(OUT, item["key"], f"{n}.jpg")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            try:
                req = urllib.request.Request(ii.get("thumburl") or ii["url"], headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
                    f.write(r.read())
            except Exception as e:
                print("download failed", p["title"], e); continue
            picked.append({"n": n, "title": p["title"], "query": query, "page": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(p['title'].replace(' ', '_'))}",
                           "thumburl": ii.get("thumburl"), "width": ii.get("width"), "height": ii.get("height"),
                           "license": lic, "artist": strip(md.get("Artist", {}).get("value", "")),
                           "credit": strip(md.get("Credit", {}).get("value", "")),
                           "description": strip(md.get("ImageDescription", {}).get("value", ""))[:200],
                           "categories": strip(md.get("Categories", {}).get("value", ""))[:300]})
            print(item["key"], n, p["title"], lic)
            time.sleep(0.3)
            if len(picked) >= CFG["per_query"] * 2:
                break
    manifest.append({"key": item["key"], "name": item["name"], "candidates": picked})

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("done:", sum(len(m["candidates"]) for m in manifest), "candidates")
