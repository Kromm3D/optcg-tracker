"""
compress_images.py
==================
Resizes and re-encodes every card image in images/ as JPEG, then patches
data/index.json so image_local paths point to the new .jpg files.

Strategy
--------
- Max width  : 480 px  (sharp for 5-col grids at 3x DPI, fine for detail view)
- JPEG quality: 82     (virtually indistinguishable from lossless at card size)
- Palette (P) and RGBA modes are composited on white before JPEG encoding.
- Original .png files are deleted after successful conversion.
- index.json: only image_local is updated (.png -> .jpg); image_source is
  untouched (it is the original CDN URL, not our file).

Usage
-----
    python scripts/compress_images.py [--dry-run] [--quality Q] [--max-width W]

Run from the repo root (D:/Tools/OPTCG-Collector/).
"""

import argparse
import json
import sys
import time
from pathlib import Path
from PIL import Image

REPO_ROOT   = Path(__file__).resolve().parent.parent
IMAGES_DIR  = REPO_ROOT / "images"
INDEX_PATH  = REPO_ROOT / "data" / "index.json"

MAX_WIDTH   = 480
QUALITY     = 82
WHITE_BG    = (255, 255, 255)


def to_rgb(img: Image.Image) -> Image.Image:
    """Convert any mode to RGB, compositing transparency on white."""
    if img.mode == "RGB":
        return img
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, WHITE_BG)
        bg.paste(img, mask=img.split()[3])
        return bg
    # P (palette), L (greyscale), CMYK, etc.
    return img.convert("RGB")


def resize_if_needed(img: Image.Image, max_width: int) -> Image.Image:
    if img.width <= max_width:
        return img
    ratio  = max_width / img.width
    new_h  = round(img.height * ratio)
    return img.resize((max_width, new_h), Image.LANCZOS)


def process_file(png_path: Path, max_width: int, quality: int, dry_run: bool) -> tuple[int, int]:
    """Returns (original_bytes, new_bytes). new_bytes=0 on dry-run."""
    jpg_path = png_path.with_suffix(".jpg")
    orig_size = png_path.stat().st_size

    if dry_run:
        return orig_size, 0

    img = Image.open(png_path)
    img = to_rgb(img)
    img = resize_if_needed(img, max_width)
    img.save(jpg_path, "JPEG", quality=quality, optimize=True)
    new_size = jpg_path.stat().st_size
    png_path.unlink()
    return orig_size, new_size


def patch_index(dry_run: bool) -> int:
    """Replace .png with .jpg in image_local fields. Returns count of changes."""
    with open(INDEX_PATH, encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    for card in data["cards"].values():
        for variant in card.get("variants", []):
            loc = variant.get("image_local", "")
            if loc.endswith(".png"):
                variant["image_local"] = loc[:-4] + ".jpg"
                changed += 1

    if not dry_run and changed:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    return changed


def main():
    parser = argparse.ArgumentParser(description="Compress OPTCG card images to JPEG")
    parser.add_argument("--dry-run",    action="store_true", help="Analyse only, no files written")
    parser.add_argument("--quality",    type=int, default=QUALITY,    metavar="Q")
    parser.add_argument("--max-width",  type=int, default=MAX_WIDTH,  metavar="W")
    args = parser.parse_args()

    png_files = sorted(IMAGES_DIR.rglob("*.png"))
    if not png_files:
        print("No .png files found under images/. Nothing to do.")
        return

    total_orig = total_new = 0
    errors = []
    t0 = time.time()

    print(f"{'DRY RUN — ' if args.dry_run else ''}Processing {len(png_files)} PNG files  "
          f"(max_width={args.max_width}  quality={args.quality})")
    print("-" * 60)

    for i, png in enumerate(png_files, 1):
        try:
            orig, new = process_file(png, args.max_width, args.quality, args.dry_run)
            total_orig += orig
            total_new  += new
        except Exception as e:
            errors.append((png, str(e)))
            print(f"  ERROR {png.name}: {e}", file=sys.stderr)

        if i % 250 == 0 or i == len(png_files):
            elapsed = time.time() - t0
            pct = i / len(png_files) * 100
            rate = i / elapsed if elapsed else 0
            eta  = (len(png_files) - i) / rate if rate else 0
            print(f"  [{i:>4}/{len(png_files)}]  {pct:5.1f}%  "
                  f"elapsed {elapsed:5.0f}s  ETA {eta:4.0f}s  "
                  f"saved so far {(total_orig - total_new)/1024/1024:.0f} MB")

    print("-" * 60)
    idx_changes = patch_index(args.dry_run)
    print(f"index.json: {idx_changes} image_local paths updated (.png -> .jpg)"
          + (" [DRY RUN]" if args.dry_run else ""))

    orig_mb = total_orig / 1024 / 1024
    if args.dry_run:
        print(f"\nTotal original: {orig_mb:.1f} MB  (dry-run: no output written)")
    else:
        new_mb   = total_new  / 1024 / 1024
        saved_mb = orig_mb - new_mb
        pct_saved = saved_mb / orig_mb * 100 if orig_mb else 0
        print(f"\nBefore : {orig_mb:.1f} MB")
        print(f"After  : {new_mb:.1f} MB")
        print(f"Saved  : {saved_mb:.1f} MB  ({pct_saved:.0f}% reduction)")

    if errors:
        print(f"\n{len(errors)} file(s) failed — check stderr for details.")
    else:
        print(f"\nAll done. {len(png_files) - len(errors)} files processed successfully.")


if __name__ == "__main__":
    main()
