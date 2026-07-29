#!/usr/bin/env python3
"""Issue #149 — deterministic synthetic sentinel generation for the PARSeq probe.

Renders with a real font from a pinned Debian package (DejaVu Sans). No manually
constructed rectangle glyphs. Generates each image twice and refuses to write
unless the two independent renderings are byte-identical.

Runs no inference and reads no corpus.
"""

import hashlib
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
POSITIVE_TEXT = "LABEL LENS 123"

CANVAS = {"width": 640, "height": 96}
FONT_SIZE = 48
TEXT_ORIGIN = {"x": 24, "y": 20}
BACKGROUND = (255, 255, 255)
FOREGROUND = (0, 0, 0)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def render(text: str) -> bytes:
    image = Image.new("RGB", (CANVAS["width"], CANVAS["height"]), BACKGROUND)
    if text:
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
        draw.text((TEXT_ORIGIN["x"], TEXT_ORIGIN["y"]), text, fill=FOREGROUND, font=font)
    from io import BytesIO

    buffer = BytesIO()
    # Fixed encoder settings so the bytes are reproducible.
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def main() -> int:
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)

    results = {}
    for name, text in (("positive", POSITIVE_TEXT), ("blank", "")):
        first = render(text)
        second = render(text)
        if first != second:
            print(json.dumps({"status": "FAILED", "reason": f"{name} regeneration not deterministic"}))
            return 1
        path = os.path.join(out_dir, f"{name}.png")
        with open(path, "wb") as handle:
            handle.write(first)
        digest = sha256_bytes(first)
        with open(f"{path}.sha256", "w") as handle:
            handle.write(f"{digest}  {name}.png\n")
        results[name] = {"sha256": digest, "bytes": len(first), "text": text or None}

    with open(FONT_PATH, "rb") as handle:
        font_sha = sha256_bytes(handle.read())

    spec = {
        "artifact": "synthetic-input-spec",
        "experimentId": "issue-149-parseq-hf-compatibility-probe",
        "generator": "scripts/eval/parseq/generate_synthetic_inputs.py",
        "renderer": "Pillow ImageDraw.text with a real TrueType font",
        "manuallyConstructedGlyphs": False,
        "font": {
            "package": "fonts-dejavu-core",
            "path": FONT_PATH,
            "sha256": font_sha,
            "license": "DejaVu Fonts License (Bitstream Vera derived), permissive",
        },
        "canvas": CANVAS,
        "fontSize": FONT_SIZE,
        "textOrigin": TEXT_ORIGIN,
        "background": BACKGROUND,
        "foreground": FOREGROUND,
        "pngEncoding": {"optimize": False, "compress_level": 9},
        "pillowVersion": __import__("PIL").__version__,
        "deterministicRegenerationVerified": True,
        "expectedPositiveTranscript": POSITIVE_TEXT,
        "expectedBlankTranscript": "",
        "images": results,
    }
    with open(os.path.join(out_dir, "synthetic-input-spec.json"), "w") as handle:
        json.dump(spec, handle, indent=2)
        handle.write("\n")
    print(json.dumps({"status": "OK", "font_sha256": font_sha, "images": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
