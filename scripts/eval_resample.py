#!/usr/bin/env python3
"""
eval_resample.py
----------------
¿Cuánta distancia de hash introduce usar un FILTRO DE REMUESTREO distinto?

POR QUÉ: los hashes de referencia (data/hashes.json) se generan con PIL LANCZOS
(build_card_database._channel_average_hash_masked). En el móvil, computeAhash()
delega el `resize` a expo-image-manipulator, que usa el escalador nativo de
Android/iOS — y NO hay ninguna garantía de que sea LANCZOS. Si los filtros no
coinciden, los 16x16 píxeles difieren -> el hash difiere -> el match verdadero
nunca llega a ~0 POR MUCHO QUE EL RECORTE SEA PERFECTO.

Esto encaja con el dato del dispositivo: tras arreglar la orientación, el match
correcto (OP09-088) se quedó en 223 bits. Ninguna degradación geométrica
razonable explica 223 (offline: recorte limpio ~0, perspectiva 6% ~124), pero un
filtro de remuestreo distinto sí podría.

La sesión del 2026-07-13 verificó el ALGORITMO de hash sobre el PNG 16x16 ya
reescalado; nunca verificó el RESIZE en sí. Este script cubre ese hueco.

USO:
    python scripts/eval_resample.py --sample 200
"""

import argparse
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

ROOT = Path(__file__).resolve().parent.parent

# Filtros candidatos. LANCZOS = la referencia (lo que usa el pipeline Python).
# BILINEAR / BOX / NEAREST / HAMMING = lo que un escalador nativo podría usar.
FILTERS = {
    "LANCZOS (referencia)": PILImage.LANCZOS,
    "BICUBIC": PILImage.BICUBIC,
    "BILINEAR": PILImage.BILINEAR,
    "HAMMING": PILImage.HAMMING,
    "BOX (area/promedio)": PILImage.BOX,
    "NEAREST": PILImage.NEAREST,
}


def channel_hash_with_filter(channel, filt):
    """Clon de _channel_average_hash_masked() pero con filtro parametrizable."""
    small = bcdb._crop_art(channel).convert("L").resize(
        (bcdb.HASH_SIZE, bcdb.HASH_SIZE), filt)
    pixels = list(small.tobytes())
    mn, mx = min(pixels), max(pixels)
    if mx > mn:
        pixels = [round((p - mn) * 255 / (mx - mn)) for p in pixels]
    kept = [p for i, p in enumerate(pixels) if i not in bcdb._MASKED_INDEX]
    mean = sum(kept) / len(kept)
    bits = [0 if i in bcdb._MASKED_INDEX else (1 if p > mean else 0)
            for i, p in enumerate(pixels)]
    out = []
    for i in range(0, len(bits), 4):
        nib = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
        out.append(format(nib, "x"))
    return "".join(out)


def rgb_hash_with_filter(img, filt):
    rgb = img.convert("RGB")
    return "".join(channel_hash_with_filter(c, filt) for c in rgb.split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=200)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    keys, db_bits, _raw = ev.load_hash_db()
    keys_bases = [ev.base_of(k) for k in keys]
    key_to_idx = {k: i for i, k in enumerate(keys)}
    index = bcdb.load_index()

    import random
    rng = random.Random(args.seed)
    sample = rng.sample(list(keys), min(args.sample, len(keys)))
    loaded = [(k, ev.img_path_for_key(k, index)) for k in sample]
    loaded = [(k, p) for k, p in loaded if p and p.exists()]

    print("=" * 76)
    print(" ¿Cuánto rompe el hash usar un filtro de remuestreo distinto a LANCZOS?")
    print("=" * 76)
    print(f" muestra = {len(loaded)} cartas · hash de 768 bits")
    print(f" contexto: el dispositivo mide 223 bits en un match CORRECTO;")
    print(f"           offline un recorte limpio da ~0 y con perspectiva 6% da ~124.\n")
    print(f" {'filtro':22} {'dist. mediana':>14} {'p90':>7} {'top-1 base':>11}")

    for name, filt in FILTERS.items():
        dists, hits = [], 0
        for true_key, path in loaded:
            img = PILImage.open(path)
            h = rgb_hash_with_filter(img, filt)
            q = ev.hex_to_bits(h)
            d = ev.hamming_all(q, db_bits)
            ti = key_to_idx[true_key]
            dists.append(int(d[ti]))
            b1, _b3, _ex, _td = ev.eval_row(d, keys_bases, keys_bases[ti], ti)
            hits += int(b1)
        med = np.median(dists)
        p90 = np.percentile(dists, 90)
        print(f" {name:22} {med:>13.0f}  {p90:>6.0f} {hits/len(loaded):>10.0%}")

    print("\n Lectura: 'dist. mediana' = distancia del hash re-calculado a SU PROPIO hash")
    print("          de referencia (LANCZOS). Si un filtro distinto mete ~200 bits, el")
    print("          resize del móvil bastaría para explicar los 223 del dispositivo,")
    print("          sin que haya nada roto en la geometría.")


if __name__ == "__main__":
    main()
