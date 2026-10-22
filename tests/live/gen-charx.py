"""Build an asset-heavy chara_card_v3 .charx: python3 gen-charx.py <emotions> <additional> <out.charx> [name]"""
import json
import os
import struct
import sys
import zipfile
import zlib


def png(w=48, h=48):
    # Unique random pixels so stock Risu never deduplicates two assets into one key.
    rnd = os.urandom(w * h * 3)
    raw = b"".join(b"\x00" + rnd[y * w * 3:(y + 1) * w * 3] for y in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


emotions, additional, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
name = sys.argv[4] if len(sys.argv) > 4 else f"AssetBot {1 + emotions + additional}"
assets, files = [], {}


def add(kind, asset, folder):
    path = f"assets/{folder}/{asset}.png"
    files[path] = png()
    assets.append({"type": kind, "uri": f"embeded://{path}", "name": asset, "ext": "png"})


add("icon", "main", "icon/image")
for i in range(emotions):
    add("emotion", f"emo{i:04d}", "emotion/image")
for i in range(additional):
    add("x-risu-asset", f"bg{i:04d}", "other/image")
card = {"spec": "chara_card_v3", "spec_version": "3.0", "data": {
    "name": name, "description": "asset-heavy cleaner test bot", "personality": "", "scenario": "",
    "first_mes": "hello", "mes_example": "", "creator_notes": "", "system_prompt": "", "post_history_instructions": "",
    "alternate_greetings": [], "tags": [], "creator": "cleaner-test", "character_version": "1", "extensions": {},
    "group_only_greetings": [], "assets": assets}}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("card.json", json.dumps(card))
    for path, data in files.items():
        archive.writestr(path, data)
print(len(assets), "assets ->", out)
