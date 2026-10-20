#!/usr/bin/env python3
"""Turn the chosen Wikimedia Commons candidates into the trial's sample photos.

Reads tools/sample-photos-choice.json ({item: [{dir, key, n}, ...]} — first entry = main photo),
writes photos/<item>_<k>.jpg (<=1280px) and photos/<item>_<k>_t.jpg (<=320px),
plus photos/credits.json (attribution per file) and photos/CREDITS.md.
"""
import json, os, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
choice = json.load(open(os.path.join(ROOT, "tools/sample-photos-choice.json"), encoding="utf-8"))
out = os.path.join(ROOT, "photos"); os.makedirs(out, exist_ok=True)
credits = {}
for item, picks in choice["items"].items():
    for k, pick in enumerate(picks, 1):
        man = json.load(open(os.path.join(pick["dir"], "manifest.json"), encoding="utf-8"))
        entry = next(c for m in man if m["key"] == pick["key"] for c in m["candidates"] if c["n"] == pick["n"])
        src = os.path.join(pick["dir"], pick["key"], f"{pick['n']}.jpg")
        im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        full = im.copy(); full.thumbnail((1280, 1280), Image.LANCZOS)
        thumb = im.copy(); thumb.thumbnail((320, 320), Image.LANCZOS)
        fn, tn = f"{item}_{k}.jpg", f"{item}_{k}_t.jpg"
        full.save(os.path.join(out, fn), "JPEG", quality=82, optimize=True, progressive=True)
        thumb.save(os.path.join(out, tn), "JPEG", quality=72, optimize=True)
        artist = entry["artist"] or "不明"
        credits[fn] = {"title": entry["title"], "page": entry["page"], "artist": artist, "license": entry["license"],
                       "credit": f"{artist}（{entry['license']}）/ Wikimedia Commons", "thumb": tn,
                       "full_kb": os.path.getsize(os.path.join(out, fn)) // 1024, "size": full.size}
        print(item, k, fn, full.size, credits[fn]["full_kb"], "KB", "|", entry["title"][:50], "|", entry["license"])
json.dump(credits, open(os.path.join(out, "credits.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
with open(os.path.join(out, "CREDITS.md"), "w", encoding="utf-8") as f:
    f.write("# サンプル写真の出典\n\nお試し版のサンプル品目に付けている参考写真は Wikimedia Commons の自由ライセンス写真です（縮小のみ）。\n\n")
    for fn, c in credits.items():
        f.write(f"- `{fn}`: [{c['title']}]({c['page']}) — {c['artist']} / {c['license']}\n")
print("total", sum(c["full_kb"] for c in credits.values()), "KB")
