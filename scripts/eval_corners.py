#!/usr/bin/env python3
"""
eval_corners.py
---------------
Micro-experimento AISLADO: ¿cuánto error de esquina introduce approxPolyDP, y lo
arregla el refinamiento por ajuste de rectas?

POR QUÉ ESTE Y NO UNA ESCENA SINTÉTICA COMPLETA: una escena (carta + fondo +
luz + Canny) tiene tantas variables que se acaba tuneando contra los artefactos
del propio simulador. Aquí sólo se rasteriza el CONTORNO de un cuadrilátero
conocido (que es lo que Canny entrega de todos modos: una línea fina) y se mide
la geometría. Sin arte, sin fondo, sin umbrales. Lo que se mide es exactamente
lo que se quiere saber.

CLAVE: epsilon = frac · perímetro es INVARIANTE A ESCALA. Subir la resolución de
detección NO reduce el error RELATIVO de approxPolyDP — sólo reduce la
cuantización del píxel. Este banco lo comprueba en vez de asumirlo.

Presupuesto de error (medido por eval_scanner.py): el matcher aguanta ~4-5% de
error de encuadre; a 8% cae al 35%.

USO:
    python scripts/eval_corners.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

CARD_ASPECT = 63 / 88
RNG = np.random.default_rng(7)


# ---------------------------------------------------------------------------
# Geometría (espejo de cardDetect.ts + el refinador candidato)
# ---------------------------------------------------------------------------
def order_corners(pts):
    """Igual que orderCorners() en app/src/lib/cardDetect.ts: TL, TR, BR, BL."""
    pts = np.array(pts, dtype=np.float32).reshape(-1, 2)
    s = pts.sum(axis=1)
    d = pts[:, 1] - pts[:, 0]
    return np.float32([pts[np.argmin(s)], pts[np.argmin(d)],
                       pts[np.argmax(s)], pts[np.argmax(d)]])


def _fit_line_tls(pts):
    """Ajuste por mínimos cuadrados totales -> (punto, dirección). PCA: robusto
    con aristas verticales, a diferencia de y = mx + b."""
    c = pts.mean(axis=0)
    _u, _s, vt = np.linalg.svd(pts - c)
    return c, vt[0]


def _intersect(p1, d1, p2, d2):
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]], dtype=np.float64)
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    t = np.linalg.solve(A, (p2 - p1).astype(np.float64))[0]
    return p1 + t * d1


def refine_quad(quad, contour, trim=0.15, band_frac=0.02):
    """Refina las 4 esquinas ajustando una recta a cada arista e intersectando.

    fast-opencv 0.4.8 NO expone cornerSubPix, pero no hace falta: con los puntos
    del contorno se ajusta una recta por arista (mínimos cuadrados totales) y se
    intersectan las adyacentes. Es geometría pura -> portable tal cual a un
    worklet TypeScript.

    trim      : fracción de cada extremo de la arista que se descarta (las
                esquinas redondeadas contaminarían el ajuste).
    band_frac : distancia máx. de un punto a la arista para contarlo, como
                fracción de la longitud de la arista (relativo, no px fijos —
                un px fijo falla en cartas grandes).
    """
    if contour is None or len(contour) < 8:
        return quad
    pts = contour.reshape(-1, 2).astype(np.float64)
    lines = []
    for i in range(4):
        a, b = quad[i].astype(np.float64), quad[(i + 1) % 4].astype(np.float64)
        ab = b - a
        L = np.linalg.norm(ab)
        if L < 1e-6:
            return quad
        d = ab / L
        n = np.array([-d[1], d[0]])
        rel = pts - a
        t = rel @ d
        dist = np.abs(rel @ n)
        sel = (t > trim * L) & (t < (1 - trim) * L) & (dist < band_frac * L)
        if sel.sum() < 6:
            return quad
        lines.append(_fit_line_tls(pts[sel]))

    out = []
    for i in range(4):
        p_prev, d_prev = lines[(i - 1) % 4]
        p_cur, d_cur = lines[i]
        x = _intersect(p_prev, d_prev, p_cur, d_cur)
        if x is None:
            return quad
        out.append(x)
    refined = np.float32(out)
    # Red de seguridad: si el refinamiento se dispara, quedarse con el original.
    if np.max(np.linalg.norm(refined - quad, axis=1)) > 0.25 * np.linalg.norm(quad[0] - quad[2]):
        return quad
    return refined


def make_quad(card_h, cx, cy, angle_deg, persp):
    """Cuadrilátero de carta conocido: TL,TR,BR,BL."""
    h = card_h
    w = CARD_ASPECT * h
    base = np.float32([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])
    a = np.deg2rad(angle_deg)
    R = np.float32([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    pts = (base @ R.T) + np.float32([cx, cy])
    pts += RNG.uniform(-persp * h, persp * h, size=(4, 2)).astype(np.float32)
    return order_corners(pts)


def _round_corners(quad, radius_frac):
    """Poligonaliza el quad con las esquinas REDONDEADAS. Las cartas OPTCG tienen
    ~3mm de radio sobre 63mm de ancho (~4.8%), y ese redondeo sesga los vértices
    de approxPolyDP hacia DENTRO — es el caso que el refinamiento debe arreglar."""
    pts = []
    for i in range(4):
        p = quad[i].astype(np.float64)
        prev = quad[(i - 1) % 4].astype(np.float64)
        nxt = quad[(i + 1) % 4].astype(np.float64)
        d_in = (p - prev) / np.linalg.norm(p - prev)
        d_out = (nxt - p) / np.linalg.norm(nxt - p)
        card_w = min(np.linalg.norm(quad[0] - quad[1]), np.linalg.norm(quad[1] - quad[2]))
        r = radius_frac * card_w
        a = p - d_in * r          # punto donde empieza el redondeo
        b = p + d_out * r         # punto donde acaba
        # Arco cuadrático de Bézier con el vértice como punto de control.
        for t in np.linspace(0, 1, 10):
            pts.append((1 - t) ** 2 * a + 2 * (1 - t) * t * p + t ** 2 * b)
    return np.float32(pts)


def rasterize(quad, size, thickness=1, blur=True, noise=True, corner_radius=0.0):
    """Dibuja el contorno del quad como una línea fina — lo que produce Canny."""
    img = np.zeros(size[::-1], np.uint8)
    poly = _round_corners(quad, corner_radius) if corner_radius > 0 else quad
    cv2.polylines(img, [np.round(poly).astype(np.int32)], True, 255, thickness,
                  lineType=cv2.LINE_AA)
    if blur:
        img = cv2.GaussianBlur(img, (3, 3), 0)
    if noise:
        img = np.clip(img.astype(np.int16) +
                      RNG.normal(0, 8, img.shape).astype(np.int16), 0, 255).astype(np.uint8)
    return (img > 60).astype(np.uint8) * 255


def detect(bin_img, eps_frac):
    cnts, _ = cv2.findContours(bin_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None, None
    c = max(cnts, key=lambda c: cv2.arcLength(c, True))
    peri = cv2.arcLength(c, True)
    if peri <= 0:
        return None, None
    ap = cv2.approxPolyDP(c, eps_frac * peri, True)
    if len(ap) != 4:
        return None, c
    return order_corners(ap), c


def err_pct(det, truth, card_h):
    return 100.0 * np.linalg.norm(det - truth, axis=1).mean() / card_h


def main():
    print("=" * 74)
    print(" MICRO-EXPERIMENTO: error de esquina de approxPolyDP + refinamiento")
    print("=" * 74)
    print(" presupuesto del matcher (de eval_scanner.py): ~4-5% OK · 8% -> 35% acierto\n")

    # Dos resoluciones de detección: la actual (480x640) y el doble (960x1280).
    # A 4% del área del frame la carta mide ~131px de alto a 480x640.
    # (etiqueta, tamaño buffer, alto de carta px, radio de esquina como frac. del ancho)
    # radio 0.00 = esquinas afiladas (irreal) · 0.048 = carta OPTCG real (3mm/63mm)
    configs = [
        ("480x640 actual · esquina AFILADA", (480, 640), 131, 0.0),
        ("480x640 actual · esquina REDONDA (real)", (480, 640), 131, 0.048),
        ("480x640 carta grande · REDONDA", (480, 640), 300, 0.048),
        ("960x1280 (2x res) · REDONDA", (960, 1280), 262, 0.048),
        ("960x1280 carta grande · REDONDA", (960, 1280), 600, 0.048),
    ]
    eps_list = [0.02, 0.01, 0.005]
    N = 200

    for label, size, card_h, radius in configs:
        print(f"--- {label} · carta {card_h}px de alto ---")
        print(f"    {'epsilon':>10} {'sin refinar':>14} {'refinado':>12} {'4-gon':>8}")
        for eps in eps_list:
            raw_errs, ref_errs, found = [], [], 0
            for _ in range(N):
                cx = size[0] / 2 + RNG.uniform(-20, 20)
                cy = size[1] / 2 + RNG.uniform(-20, 20)
                q = make_quad(card_h, cx, cy, RNG.uniform(-15, 15), 0.02)
                img = rasterize(q, size, corner_radius=radius)
                det, cnt = detect(img, eps)
                if det is None:
                    continue
                found += 1
                truth = order_corners(q)
                raw_errs.append(err_pct(det, truth, card_h))
                ref = refine_quad(det, cnt)
                ref_errs.append(err_pct(order_corners(ref), truth, card_h))
            if not raw_errs:
                print(f"    {eps:>10} {'—':>14} {'—':>12} {found/N:>7.0%}")
                continue
            print(f"    {eps:>10} {np.median(raw_errs):>13.2f}% "
                  f"{np.median(ref_errs):>11.2f}% {found/N:>7.0%}")
        print()

    print(" Lectura: 'sin refinar' = vértices crudos de approxPolyDP.")
    print("          'refinado'    = ajuste de rectas a las aristas + intersección.")
    print("          '4-gon'       = % de casos en que approxPolyDP dio exactamente 4 vértices")
    print("                          (si baja, el epsilon es demasiado fino y se rechaza la carta).")


if __name__ == "__main__":
    main()
