"""
compress_images.py
==================
Convierte todas las imágenes de cartas existentes en images/ a WebP y actualiza
data/index.json para que image_local apunte a los nuevos ficheros .webp.

Estrategia
----------
- Entrada   : .png, .jpg / .jpeg existentes en images/**
- Salida    : .webp en la misma carpeta (mismo stem)
- Max ancho : 480 px  (más que suficiente para grids de 5 col a 3x DPI)
- Calidad   : WebP 80  (≈ JPEG 90 visualmente, ~35% más pequeño que JPEG 82)
- Método    : 6 (mejor compresión, la codificación es offline y podemos permitirlo)
- Alpha     : WebP soporta RGBA nativamente; se preserva la transparencia PNG.
- Originales: se eliminan tras la conversión exitosa.
- index.json: se actualizan los image_local de .png/.jpg -> .webp.

Uso
---
    python scripts/compress_images.py              # conversión real
    python scripts/compress_images.py --dry-run    # análisis sin escribir
    python scripts/compress_images.py --quality 75 # ajustar calidad
    python scripts/compress_images.py --max-width 360

Ejecutar desde la raíz del repo (D:/Tools/OPTCG-Collector/).
"""

import argparse
import json
import sys
import time
from pathlib import Path
from PIL import Image

REPO_ROOT  = Path(__file__).resolve().parent.parent
IMAGES_DIR = REPO_ROOT / "images"
INDEX_PATH = REPO_ROOT / "data" / "index.json"

MAX_WIDTH    = 480
WEBP_QUALITY = 80
WEBP_METHOD  = 6  # 0=fast … 6=best compression


def to_webp_ready(img: Image.Image) -> Image.Image:
    """Normaliza el modo a RGB o RGBA para codificar como WebP."""
    if img.mode in ("RGB", "RGBA"):
        return img
    if img.mode == "P" and "transparency" in img.info:
        return img.convert("RGBA")
    return img.convert("RGB")


def resize_if_needed(img: Image.Image, max_width: int) -> Image.Image:
    if img.width <= max_width:
        return img
    ratio = max_width / img.width
    new_h = round(img.height * ratio)
    return img.resize((max_width, new_h), Image.LANCZOS)


def process_file(src: Path, max_width: int, quality: int, dry_run: bool) -> tuple[int, int]:
    """Convierte src a WebP. Devuelve (bytes_originales, bytes_nuevos)."""
    orig_size = src.stat().st_size
    webp_path = src.with_suffix(".webp")

    if dry_run:
        return orig_size, 0

    img = Image.open(src)
    img = to_webp_ready(img)
    img = resize_if_needed(img, max_width)

    tmp = webp_path.with_suffix(".webp.tmp")
    img.save(tmp, "WEBP", quality=quality, method=WEBP_METHOD)
    tmp.replace(webp_path)

    new_size = webp_path.stat().st_size
    src.unlink()  # eliminar el original
    return orig_size, new_size


def patch_index(dry_run: bool) -> int:
    """Actualiza image_local en index.json: .png/.jpg → .webp. Devuelve nº cambios."""
    with open(INDEX_PATH, encoding="utf-8") as f:
        data = json.load(f)

    changed = 0
    for card in data["cards"].values():
        for variant in card.get("variants", []):
            loc = variant.get("image_local", "")
            if loc and not loc.endswith(".webp"):
                variant["image_local"] = loc.rsplit(".", 1)[0] + ".webp"
                changed += 1

    if not dry_run and changed:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    return changed


def main():
    parser = argparse.ArgumentParser(description="Convierte imágenes OPTCG a WebP")
    parser.add_argument("--dry-run",   action="store_true", help="Analiza sin escribir ficheros")
    parser.add_argument("--quality",   type=int, default=WEBP_QUALITY, metavar="Q",
                        help=f"Calidad WebP 0-100 (defecto {WEBP_QUALITY})")
    parser.add_argument("--max-width", type=int, default=MAX_WIDTH,    metavar="W",
                        help=f"Ancho máximo en px (defecto {MAX_WIDTH})")
    args = parser.parse_args()

    # Recoger .png, .jpg y .jpeg (excluir los .webp ya convertidos)
    src_files = sorted(
        list(IMAGES_DIR.rglob("*.png")) +
        list(IMAGES_DIR.rglob("*.jpg")) +
        list(IMAGES_DIR.rglob("*.jpeg"))
    )

    if not src_files:
        print("No se encontraron .png/.jpg bajo images/. Nada que hacer.")
        return

    total_orig = total_new = 0
    errors = []
    t0 = time.time()

    label = "DRY RUN — " if args.dry_run else ""
    print(f"{label}Convirtiendo {len(src_files)} imágenes a WebP "
          f"(calidad={args.quality}  max_width={args.max_width}  method={WEBP_METHOD})")
    print("-" * 65)

    for i, src in enumerate(src_files, 1):
        try:
            orig, new = process_file(src, args.max_width, args.quality, args.dry_run)
            total_orig += orig
            total_new  += new
        except Exception as e:
            errors.append((src, str(e)))
            print(f"  ERROR {src.name}: {e}", file=sys.stderr)

        if i % 250 == 0 or i == len(src_files):
            elapsed = time.time() - t0
            rate = i / elapsed if elapsed else 0
            eta  = (len(src_files) - i) / rate if rate else 0
            saved_mb = (total_orig - total_new) / 1024 / 1024
            print(f"  [{i:>4}/{len(src_files)}]  {i/len(src_files)*100:5.1f}%  "
                  f"elapsed {elapsed:5.0f}s  ETA {eta:4.0f}s  "
                  f"ahorrado {saved_mb:.0f} MB")

    print("-" * 65)
    idx_changes = patch_index(args.dry_run)
    print(f"index.json: {idx_changes} rutas actualizadas (.png/.jpg → .webp)"
          + (" [DRY RUN]" if args.dry_run else ""))

    orig_mb = total_orig / 1024 / 1024
    if args.dry_run:
        print(f"\nTotal original: {orig_mb:.1f} MB  (dry-run: nada escrito)")
    else:
        new_mb    = total_new  / 1024 / 1024
        saved_mb  = orig_mb - new_mb
        pct_saved = saved_mb / orig_mb * 100 if orig_mb else 0
        print(f"\nAntes  : {orig_mb:.1f} MB")
        print(f"Después: {new_mb:.1f} MB")
        print(f"Ahorro : {saved_mb:.1f} MB  ({pct_saved:.0f}% reducción)")

    if errors:
        print(f"\n{len(errors)} fichero(s) fallaron — ver stderr.")
    else:
        print(f"\nHecho. {len(src_files) - len(errors)} ficheros procesados.")


if __name__ == "__main__":
    main()
