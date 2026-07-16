#!/usr/bin/env python3
"""
eval_multicrop.py
-----------------
¿Se puede hacer el MATCHER tolerante al error de encuadre, en vez de exigirle a
Stage-1 una precisión que nunca dará en el mundo real?

EL PROBLEMA (medido en eval_scanner.py): el error de encuadre es el killer
dominante y es un acantilado — 4% -> 99% de acierto, 8% -> 39%, 12% -> 6%.
Todo lo demás (luz, blur, resolución, perspectiva leve, incluso una "foto real"
completa con reflejo y ruido) lo aguanta al 97-100%.

LA IDEA: ART_CROP es un recorte FIJO [0.05, 0.05, 0.90, 0.38] de la carta. Si
Stage-1 encuadra con un 8% de error, esa banda cae sobre la zona equivocada y el
hash se rompe. Pero hashear es barato: en vez de exigir un encuadre perfecto, se
prueban varias ESCALAS de la banda y se queda la mejor. El coste es lineal en el
nº de escalas; la tolerancia se ensancha.

Mide el acierto con 1 escala (lo que hay hoy) vs. 3 y 5 escalas, bajo error de
encuadre creciente. Si 3 escalas recuperan el caso del 8%, es una mejora grande,
en JS puro y sin tocar nada nativo.

USO:
    python scripts/eval_multicrop.py --sample 150
"""

import argparse
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image as PILImage

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_card_database as bcdb  # noqa: E402
import eval_scanner as ev           # noqa: E402

BASE_CROP = tuple(bcdb.ART_CROP)   # (0.05, 0.05, 0.90, 0.38)


def crop_variants(n):
    """n escalas de ART_CROP alrededor de la banda base, centradas en el mismo
    punto. zoom<1 = banda más estrecha (compensa un crop de Stage-1 abierto);
    zoom>1 = banda más ancha (compensa un crop demasiado cerrado)."""
    if n == 1:
        return [BASE_CROP]
    zooms = {3: [0.90, 1.0, 1.10], 5: [0.84, 0.92, 1.0, 1.08, 1.16]}[n]
    x, y, w, h = BASE_CROP
    cx, cy = x + w / 2, y + h / 2
    out = []
    for z in zooms:
        nw, nh = w * z, h * z
        out.append((cx - nw / 2, cy - nh / 2, nw, nh))
    return out


def hash_with_crop(img, crop):
    """Recalcula el hash de producción con un ART_CROP alternativo."""
    old = bcdb.ART_CROP
    try:
        bcdb.ART_CROP = crop
        return ev.hex_to_bits(bcdb.rgb_average_hash(img))
    finally:
        bcdb.ART_CROP = old


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=150)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    keys, db_bits, _ = ev.load_hash_db()
    keys_bases = [ev.base_of(k) for k in keys]
    key_to_idx = {k: i for i, k in enumerate(keys)}
    index = bcdb.load_index()

    rng = random.Random(args.seed)
    sample = rng.sample(list(keys), args.sample)
    loaded = [(k, ev.img_path_for_key(k, index)) for k in sample]
    loaded = [(k, p) for k, p in loaded if p and p.exists()]

    # Degradaciones de encuadre — la variable que de verdad manda.
    scenarios = [
        ("sin error",     lambda im: im),
        ("crop 4%",       ev.deg_crop_jitter),
        ("crop 8%",       ev.deg_crop_jitter8),
        ("crop 12%",      ev.deg_crop_jitter12),
        ("foto real",     ev.deg_photo_real),
        ("foto real+8%",  lambda im: ev.deg_crop_jitter8(ev.deg_photo_real(im))),
    ]

    print("=" * 74)
    print(" ¿Hacer el MATCHER tolerante al encuadre en vez de exigir a Stage-1?")
    print("=" * 74)
    print(f" {len(loaded)} cartas · top-1 por código base · coste = nº de escalas\n")
    print(f" {'escenario':16} {'1 escala (hoy)':>15} {'3 escalas':>11} {'5 escalas':>11}")

    for label, fn in scenarios:
        row = []
        for n in (1, 3, 5):
            variants = crop_variants(n)
            hits = 0
            for true_key, path in loaded:
                img = fn(PILImage.open(path).convert("RGB"))
                qs = np.stack([hash_with_crop(img, c) for c in variants], axis=0)
                d = ev.hamming_all_multi(qs, db_bits)
                ti = key_to_idx[true_key]
                if keys_bases[int(d.argmin())] == keys_bases[ti]:
                    hits += 1
            row.append(hits / len(loaded))
        print(f" {label:16} {row[0]:>14.0%} {row[1]:>10.0%} {row[2]:>10.0%}")

    print("\n Si 3 escalas recuperan 'crop 8%', el presupuesto de Stage-1 se relaja")
    print(" de ~4% a ~8-12% — que es la diferencia entre 'funciona en el laboratorio'")
    print(" y 'funciona en cualquier entorno'.")


if __name__ == "__main__":
    main()
