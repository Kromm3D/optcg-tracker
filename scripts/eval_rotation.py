#!/usr/bin/env python3
"""
eval_rotation.py
----------------
¿Qué pasa cuando la carta se sostiene GIRADA? Aísla la geometría de
orderCorners() + rectifyCardCrop() usando esquinas VERDADERAS (sin Canny, sin
detección) para que lo único bajo prueba sea el mapeo quad -> recorte vertical.

LA SOSPECHA (leída en el código, no adivinada):
  - isCardQuad() valida el aspecto con `min(w,h)/max(w,h)`, que es SIMÉTRICO:
    acepta la carta tanto vertical (w/h=0.716) como APAISADA (w/h=1.4).
  - rectifyCardCrop() warpea SIEMPRE a RECTIFIED_W x RECTIFIED_H = 350x490
    (vertical), mapeando TL->(0,0), TR->(350,0), BR->(350,490), BL->(0,490).
  => Si el quad sale apaisado, la carta se APLASTA ~2:1 al forzarla al lienzo
     vertical. Y rotar una imagen aplastada NO la desaplasta: las 4 rotaciones
     de matchTopK no pueden recuperarla.

orderCorners() asigna TL/TR/BR/BL por POSICIÓN EN PANTALLA (sumas y diferencias),
no según el "arriba" de la carta. Al girar la carta más de ~45° el rol de los
lados se intercambia y el quad pasa a leerse apaisado.

EL FIX PROPUESTO (geometría pura, portable a TypeScript, sin riesgo nativo):
  Si el quad se lee apaisado (w > h), rotar la ASIGNACIÓN de esquinas una
  posición antes de warpear. Así el lienzo vertical recibe siempre el lado
  corto de la carta como ancho. Resuelve además la orientación de 90/270, con
  lo que sólo queda la ambigüedad de 180° -> 2 rotaciones en vez de 4:
  la mitad de oportunidades de coincidencia falsa Y el doble de rápido.

USO:
    python scripts/eval_rotation.py --sample 60
"""

import argparse
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image as PILImage

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_card_database as bcdb  # noqa: E402
import eval_scanner as ev           # noqa: E402

RECTIFIED_W, RECTIFIED_H = 350, 490
CANVAS = 1200


def order_corners(pts):
    """Clon EXACTO de orderCorners() en app/src/lib/cardDetect.ts."""
    pts = np.array(pts, dtype=np.float32).reshape(-1, 2)
    s = pts.sum(axis=1)
    d = pts[:, 1] - pts[:, 0]
    return np.float32([pts[np.argmin(s)], pts[np.argmin(d)],
                       pts[np.argmax(s)], pts[np.argmax(d)]])


def fix_landscape(quad):
    """EL FIX: si el quad se lee apaisado, rota la asignación de esquinas una
    posición para que el lado corto de la carta sea el ancho del lienzo."""
    w = (np.linalg.norm(quad[0] - quad[1]) + np.linalg.norm(quad[3] - quad[2])) / 2
    h = (np.linalg.norm(quad[0] - quad[3]) + np.linalg.norm(quad[1] - quad[2])) / 2
    if w > h:
        return np.float32([quad[1], quad[2], quad[3], quad[0]])
    return quad


def render_rotated(card_img, angle_deg):
    """Dibuja la carta girada `angle_deg` en un lienzo. Devuelve (lienzo,
    esquinas verdaderas TL,TR,BR,BL DE LA CARTA en coords del lienzo)."""
    card = cv2.cvtColor(np.array(card_img.convert("RGB")), cv2.COLOR_RGB2BGR)
    ch, cw = card.shape[:2]
    canvas = np.full((CANVAS, CANVAS, 3), 60, np.uint8)

    scale = 700.0 / max(cw, ch)
    w, h = cw * scale, ch * scale
    cx = cy = CANVAS / 2
    a = np.deg2rad(angle_deg)
    R = np.float32([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    # Esquinas de la carta EN SU PROPIO ORDEN (TL,TR,BR,BL de la ilustración).
    local = np.float32([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])
    truth = (local @ R.T) + np.float32([cx, cy])

    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [cw, 0], [cw, ch], [0, ch]]), truth)
    warped = cv2.warpPerspective(card, M, (CANVAS, CANVAS))
    mask = cv2.warpPerspective(np.full((ch, cw), 255, np.uint8), M, (CANVAS, CANVAS))
    canvas[mask > 127] = warped[mask > 127]
    return canvas, truth


def rectify(canvas, quad):
    """Clon de rectifyCardCrop(): warpea el quad al lienzo VERTICAL 350x490."""
    dst = np.float32([[0, 0], [RECTIFIED_W, 0], [RECTIFIED_W, RECTIFIED_H], [0, RECTIFIED_H]])
    M = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    out = cv2.warpPerspective(canvas, M, (RECTIFIED_W, RECTIFIED_H))
    return PILImage.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def best_over_rotations(img, db_bits, rotations):
    """Modela matchTopK: mejor distancia por carta sobre N rotaciones."""
    qs = []
    for r in rotations:
        im = img if r == 0 else img.rotate(-r, expand=True)
        qs.append(ev.rehash(im))
    return ev.hamming_all_multi(np.stack(qs, axis=0), db_bits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=60)
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

    angles = [0, 15, 30, 44, 46, 60, 75, 90]
    print("=" * 78)
    print(" LA CARTA GIRADA: ¿aguanta la geometría de orderCorners + rectify?")
    print("=" * 78)
    print(f" {len(loaded)} cartas · esquinas VERDADERAS (sin Canny) · aisla sólo el warp\n")
    print(f" {'ángulo':>7} {'quad w/h':>9} | {'ACTUAL (4 rot)':>15} | {'CON FIX (2 rot)':>16}")
    print(f" {'':>7} {'':>9} | {'top-1':>7} {'dist':>7} | {'top-1':>7} {'dist':>8}")

    for ang in angles:
        wh_list = []
        cur_hits, cur_d = 0, []
        fix_hits, fix_d = 0, []
        for true_key, path in loaded:
            card = PILImage.open(path)
            canvas, truth = render_rotated(card, ang)
            quad = order_corners(truth)          # lo que hace hoy la app
            w = (np.linalg.norm(quad[0] - quad[1]) + np.linalg.norm(quad[3] - quad[2])) / 2
            h = (np.linalg.norm(quad[0] - quad[3]) + np.linalg.norm(quad[1] - quad[2])) / 2
            wh_list.append(w / h)
            ti = key_to_idx[true_key]
            tb = keys_bases[ti]

            # ACTUAL: warp directo + 4 rotaciones en matchTopK
            d = best_over_rotations(rectify(canvas, quad), db_bits, [0, 90, 180, 270])
            if keys_bases[int(d.argmin())] == tb:
                cur_hits += 1
            cur_d.append(int(d[ti]))

            # CON FIX: corregir el quad apaisado + sólo 2 rotaciones (0/180)
            d2 = best_over_rotations(rectify(canvas, fix_landscape(quad)), db_bits, [0, 180])
            if keys_bases[int(d2.argmin())] == tb:
                fix_hits += 1
            fix_d.append(int(d2[ti]))

        n = len(loaded)
        print(f" {ang:>6}° {np.median(wh_list):>9.3f} | {cur_hits/n:>6.0%} "
              f"{np.median(cur_d):>7.0f} | {fix_hits/n:>6.0%} {np.median(fix_d):>7.0f}")

    print("\n quad w/h ~0.716 = vertical (bien) · ~1.40 = APAISADO -> aplastado al warpear.")
    print(" 'dist' = distancia al hash verdadero (768 bits). Referencia del dispositivo: 223.")


if __name__ == "__main__":
    main()
