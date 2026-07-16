#!/usr/bin/env python3
"""
eval_scanner.py
---------------
Banco de pruebas OFFLINE de la calidad del matcher por pHash (Stage-2 del
escáner). NO toca código de producción: reutiliza las MISMAS funciones de hash
que build_card_database.py (paridad bit-a-bit con lo que va embarcado en la app)
y mide, con números duros, el problema de discriminación documentado como B-14
en AGENTS.md.

Responde tres preguntas:

  A) DISCRIMINACIÓN BASE — ¿cuánto separa el hash a cartas distintas cuando la
     foto es perfecta? (reproduce la afirmación "NN mediana ~262, ~1% < 100" del
     comentario de cardMatch.ts). Es el techo de separación disponible.

  B) SIMULACIÓN DE ESCANEO — coge la imagen real, le aplica una degradación
     (rotación, brillo/contraste tipo funda, jitter de recorte, blur/downscale
     de cámara), REHASHEA con el mismo algoritmo y busca en la base de 4.571
     hashes precomputados. Reporta top-1 / top-3 y la distancia del match real.

  C) B-14 (orientación) — el fallo concreto: un recorte rectificado con la
     orientación equivocada. Mide (1) cuántas veces una carta EQUIVOCADA gana a
     la verdadera con una sola rotación mala, y (2) si la estrategia de
     matchTopK (probar las 4 rotaciones y quedarse con la mejor) lo recupera.

USO:
    python scripts/eval_scanner.py                 # muestra de 300 cartas
    python scripts/eval_scanner.py --sample 800    # muestra mayor (más lento)
    python scripts/eval_scanner.py --sample 0      # TODAS las cartas (lento)
    python scripts/eval_scanner.py --seed 7        # otra muestra reproducible
    python scripts/eval_scanner.py --only base      # solo la parte A
    python scripts/eval_scanner.py --csv out.csv    # volcar resultados por-carta

Requiere: pillow numpy   (el python del sistema ya los tiene).
"""

import argparse
import csv
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image as PILImage, ImageEnhance, ImageFilter

# La consola de Windows es cp1252 y revienta con ·, —, ↔, etc. Forzar UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Reutiliza las funciones de hash de producción → paridad garantizada.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_card_database as bcdb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HASHES_PATH = ROOT / "data" / "hashes.json"

HEX_LEN = 3 * bcdb.HASH_SIZE * bcdb.HASH_SIZE // 4   # 192 hex para 768 bits
N_BITS = 3 * bcdb.HASH_SIZE * bcdb.HASH_SIZE          # 768


# ---------------------------------------------------------------------------
# Utilidades de bits: hex → matriz de bits para hamming vectorizado en numpy
# ---------------------------------------------------------------------------
def hex_to_bits(h: str) -> np.ndarray:
    """'f0..' (192 hex) → np.uint8 de 768 bits (MSB primero por nibble)."""
    v = int(h, 16)
    bits = np.frombuffer(v.to_bytes(N_BITS // 8, "big"), dtype=np.uint8)
    return np.unpackbits(bits)


def load_hash_db():
    """Devuelve (keys, bits_matrix[N×768] uint8, raw_hex_dict)."""
    payload = json.loads(HASHES_PATH.read_text(encoding="utf-8"))
    hashes = payload["hashes"]
    keys = list(hashes.keys())
    mat = np.zeros((len(keys), N_BITS), dtype=np.uint8)
    for i, k in enumerate(keys):
        mat[i] = hex_to_bits(hashes[k])
    return keys, mat, hashes


def hamming_all(query_bits: np.ndarray, db_bits: np.ndarray) -> np.ndarray:
    """Distancia hamming de un query (768,) contra toda la BD (N×768)."""
    return np.count_nonzero(db_bits != query_bits, axis=1)


def hamming_all_multi(query_bits_multi: np.ndarray, db_bits: np.ndarray) -> np.ndarray:
    """Mínima distancia sobre VARIAS variantes de query (R×768) contra la BD.
    Modela matchTopK: la distancia de una carta = mejor de sus R rotaciones."""
    dists = np.stack([hamming_all(q, db_bits) for q in query_bits_multi], axis=0)
    return dists.min(axis=0)


def base_of(key: str) -> str:
    """Código base de una variantKey ('OP01-001_p1' → 'OP01-001').
    Es lo que el matcher debe acertar: el usuario elige la variante visualmente
    (CLAUDE.md §2), así que un paralelo del mismo código cuenta como ACIERTO."""
    return bcdb.split_code(key)[0]


# ---------------------------------------------------------------------------
# Rehash de una imagen (con degradación) usando el algoritmo de producción
# ---------------------------------------------------------------------------
def rehash(img: PILImage.Image) -> np.ndarray:
    """Aplica rgb_average_hash de producción y devuelve los 768 bits."""
    return hex_to_bits(bcdb.rgb_average_hash(img))


def img_path_for_key(key: str, index: dict) -> Path | None:
    """Ruta de la imagen local de una variantKey ('OP01-001_p1')."""
    code, suffix = bcdb.split_code(key)
    entry = index.get(code)
    if not entry:
        return None
    for v in entry.get("variants", []):
        if v.get("suffix", "") == suffix:
            rel = v.get("image_local", "")
            return (ROOT / rel) if rel else None
    return None


# ---------------------------------------------------------------------------
# Degradaciones — proxies de las condiciones reales de escaneo
# ---------------------------------------------------------------------------
def deg_clean(img):
    return img

def deg_rot90(img):
    return img.rotate(-90, expand=True)   # horario, como expo rotate

def deg_rot180(img):
    return img.rotate(180, expand=True)

def deg_rot270(img):
    return img.rotate(-270, expand=True)

def deg_bright_up(img):
    return ImageEnhance.Brightness(img).enhance(1.35)   # foco/reflejo de funda

def deg_bright_down(img):
    return ImageEnhance.Brightness(img).enhance(0.7)     # sombra/binder

def deg_lowcontrast(img):
    return ImageEnhance.Contrast(img).enhance(0.6)        # velo de plástico

def deg_blur(img):
    return img.filter(ImageFilter.GaussianBlur(1.2))      # cámara/movimiento

def deg_downscale(img):
    w, h = img.size
    small = img.resize((max(1, w // 4), max(1, h // 4)), PILImage.LANCZOS)
    return small.resize((w, h), PILImage.LANCZOS)          # pérdida de resolución

def _crop_jitter(img, frac):
    """Recorte/zoom simétrico de `frac` por lado: rectificado impreciso (zoom)."""
    w, h = img.size
    dx, dy = round(w * frac), round(h * frac)
    return img.crop((dx, dy, w - dx, h - dy)).resize((w, h), PILImage.LANCZOS)

def deg_crop_jitter(img):
    return _crop_jitter(img, 0.04)

def deg_crop_jitter8(img):
    return _crop_jitter(img, 0.08)

def deg_crop_jitter12(img):
    return _crop_jitter(img, 0.12)


def _find_coeffs(src, dst):
    """Coeficientes para PIL Image.transform(PERSPECTIVE): mapea dst→src."""
    a = []
    for (xd, yd), (xs, ys) in zip(dst, src):
        a.append([xd, yd, 1, 0, 0, 0, -xs * xd, -xs * yd])
        a.append([0, 0, 0, xd, yd, 1, -ys * xd, -ys * yd])
    A = np.array(a, dtype=np.float64)
    b = np.array([c for pt in src for c in pt], dtype=np.float64)
    return np.linalg.solve(A, b)

def _perspective(img, jitter):
    """Warp de perspectiva: desplaza cada esquina hasta `jitter`·lado, como un
    rectificado con esquinas mal localizadas (el mecanismo real de B-14)."""
    w, h = img.size
    rng = random.Random(0xC0FFEE ^ (w * 31 + h))
    corners = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(x + rng.uniform(-jitter, jitter) * w,
            y + rng.uniform(-jitter, jitter) * h) for x, y in corners]
    coeffs = _find_coeffs(corners, dst)
    return img.transform((w, h), PILImage.PERSPECTIVE, coeffs, PILImage.BICUBIC)

def deg_persp_mild(img):
    return _perspective(img, 0.06)

def deg_persp_strong(img):
    return _perspective(img, 0.12)


def _color_temp(img, warm):
    """Desvía el balance de blancos (luz cálida/fría). Un escaneo oficial y una
    foto bajo bombilla NO comparten balance de color."""
    r, g, b = img.split()
    r = ImageEnhance.Brightness(r).enhance(1.0 + warm)
    b = ImageEnhance.Brightness(b).enhance(1.0 - warm)
    return PILImage.merge("RGB", (r, g, b))


def _glare(img, strength=0.45):
    """Reflejo especular difuso: el brillo de una funda bajo un foco."""
    w, h = img.size
    xs = np.linspace(-1, 1, w)[None, :]
    ys = np.linspace(-1, 1, h)[:, None]
    spot = np.exp(-(((xs - 0.25) ** 2 + (ys + 0.35) ** 2) / 0.18))
    arr = np.asarray(img).astype(np.float32)
    arr = arr + (255.0 - arr) * (strength * spot)[:, :, None]
    return PILImage.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def deg_photo_real(img):
    """LA PRUEBA CLAVE — "foto real" en vez de "escaneo oficial re-degradado".

    Todas las demás degradaciones parten de la MISMA imagen de la que salió el
    hash de referencia, así que miden un problema más fácil que el real. Una foto
    de cámara de una carta física difiere del escaneo oficial en balance de color,
    gamma, reflejo de funda, ruido de sensor y enfoque — todo a la vez. Esto
    apila esos efectos para estimar el SUELO de distancia intrínseco, y así saber
    si los 223 bits del dispositivo son un bug o el techo del descriptor.
    """
    out = _color_temp(img, 0.10)
    out = ImageEnhance.Color(out).enhance(1.25)          # saturación de cámara
    arr = np.asarray(out).astype(np.float32) / 255.0
    arr = np.power(arr, 1.15)                              # gamma distinto
    out = PILImage.fromarray((arr * 255).astype(np.uint8))
    out = _glare(out, 0.40)                                # reflejo de funda
    out = ImageEnhance.Contrast(out).enhance(0.9)
    out = out.filter(ImageFilter.GaussianBlur(0.8))        # enfoque de cámara
    arr = np.asarray(out).astype(np.float32)
    arr += np.random.default_rng(0).normal(0, 4, arr.shape)  # ruido de sensor
    out = PILImage.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return _perspective(out, 0.05)                         # sostenida a mano


# Degradaciones "de una sola foto" (top-1 esperado = la carta verdadera).
SINGLE_DEGRADATIONS = [
    ("clean",         deg_clean),
    ("bright_up",     deg_bright_up),
    ("bright_down",   deg_bright_down),
    ("low_contrast",  deg_lowcontrast),
    ("blur",          deg_blur),
    ("downscale",     deg_downscale),
    ("crop_jit_4%",   deg_crop_jitter),
    ("crop_jit_8%",   deg_crop_jitter8),
    ("crop_jit_12%",  deg_crop_jitter12),
    ("persp_mild_6%", deg_persp_mild),
    ("persp_strong",  deg_persp_strong),
    ("PHOTO_REAL",    deg_photo_real),
    ("rot90",         deg_rot90),
    ("rot180",        deg_rot180),
    ("rot270",        deg_rot270),
]


def pct(x):
    return f"{100 * x:5.1f}%"


# ---------------------------------------------------------------------------
# Parte A — Discriminación base (todas o muestra), sobre hashes precomputados
# ---------------------------------------------------------------------------
def part_a_discrimination(keys, db_bits):
    print("\n" + "=" * 68)
    print(" A) DISCRIMINACIÓN BASE  —  ¿se distinguen cartas DISTINTAS? (foto perfecta)")
    print("=" * 68)
    n = len(keys)
    bases = np.array([base_of(k) for k in keys])
    # Máscara por-fila: excluir todas las variantes del mismo código base (mismo
    # arte). Lo que importa es cuánto separa el hash a cartas realmente distintas.
    nn_cross = np.empty(n, dtype=np.int32)   # vecino de OTRA carta
    nn_intra = np.full(n, N_BITS + 1, dtype=np.int32)  # variante de la MISMA carta
    j_cross = np.empty(n, dtype=np.int32)
    for i in range(n):
        d = hamming_all(db_bits[i], db_bits)
        same_base = bases == bases[i]
        dd = d.copy(); dd[same_base] = N_BITS + 1
        nn_cross[i] = dd.min(); j_cross[i] = int(dd.argmin())
        other_variant = same_base.copy(); other_variant[i] = False
        if other_variant.any():
            nn_intra[i] = d[other_variant].min()

    p = np.percentile(nn_cross, [0, 1, 5, 50])
    print(f"  N = {n} variantes · {N_BITS} bits")
    print(f"  distancia a la CARTA DISTINTA más cercana (código base distinto):")
    print(f"    mín      = {p[0]:.0f} bits   ← el peor caso de confusión real")
    print(f"    p1       = {p[1]:.0f} bits")
    print(f"    p5       = {p[2]:.0f} bits")
    print(f"    mediana  = {p[3]:.0f} bits")
    under = lambda t: int(np.count_nonzero(nn_cross < t))
    print(f"  cartas con OTRA carta peligrosamente cerca:")
    for t in (100, 150, 200, 235):
        print(f"    < {t:>3} bits: {under(t):4d}  ({pct(under(t)/n)})"
              + ("   ← por debajo del umbral actual (235)" if t == 235 else ""))
    print(f"  referencia: umbral de aceptación actual AHASH_MAX_DISTANCE = 235")

    intra_valid = nn_intra[nn_intra <= N_BITS]
    if len(intra_valid):
        pi = np.percentile(intra_valid, [50, 95])
        print(f"  (para contexto) variantes del MISMO código base — mismo arte:")
        print(f"    {len(intra_valid)} variantes con paralelo · mediana {pi[0]:.0f} · p95 {pi[1]:.0f} bits"
              f"  → se solapan, por eso se casa por CÓDIGO no por variante exacta")

    worst = np.argsort(nn_cross)[:10]
    print("  10 pares de CARTAS DISTINTAS más confundibles (mismo arte real):")
    for i in worst:
        print(f"    {keys[i]:16} ~ {keys[int(j_cross[i])]:16}  {nn_cross[i]:3d} bits")
    return nn_cross


# ---------------------------------------------------------------------------
# Parte B + C — Simulación de escaneo con degradaciones
# ---------------------------------------------------------------------------
def eval_row(dist_row, keys_bases, true_base, true_idx, order_k=3):
    """Evalúa un ranking de distancias para una query.

    Devuelve (base_top1, base_top3, exact_top1, true_dist):
      base_top1  — el mejor candidato comparte código base con la carta real (el
                   criterio del producto: el usuario elige variante a mano)
      base_top3  — algún candidato del top-3 comparte código base
      exact_top1 — el mejor candidato es la variante EXACTA (métrica secundaria)
      true_dist  — distancia a la variante exacta real (para calibrar umbral)
    """
    order = np.argsort(dist_row, kind="stable")
    top1 = order[0]
    top3 = order[:order_k]
    base_top1 = keys_bases[top1] == true_base
    base_top3 = any(keys_bases[j] == true_base for j in top3)
    exact_top1 = top1 == true_idx
    return base_top1, base_top3, exact_top1, int(dist_row[true_idx])


def part_bc(keys, db_bits, index, sample_keys, want_csv):
    print("\n" + "=" * 68)
    print(" B) SIMULACIÓN DE ESCANEO  —  rehash de la imagen real + búsqueda")
    print("=" * 68)
    print(f"  muestra = {len(sample_keys)} cartas · degradando y re-buscando en {len(keys)} hashes")

    keys_bases = [base_of(k) for k in keys]
    key_to_idx = {k: i for i, k in enumerate(keys)}
    # Precarga imágenes (una vez por carta).
    loaded = []
    missing = 0
    for k in sample_keys:
        p = img_path_for_key(k, index)
        if p and p.exists():
            loaded.append((k, p))
        else:
            missing += 1
    if missing:
        print(f"  ({missing} sin imagen local — saltadas)")

    results = {name: {"b1": 0, "b3": 0, "exact": 0, "true_d": []}
               for name, _ in SINGLE_DEGRADATIONS}
    # C) métricas de orientación (todo por CÓDIGO base)
    b14_wrong_wins = 0      # una carta equivocada gana con UNA rotación mala (peor caso)
    b14_recovered = 0       # matchTopK (4 rot) recupera top-1, crop PERFECTO
    b14_recovered_real = 0  # matchTopK, crop REALISTA (perspectiva imperfecta)
    b14_total = 0
    csv_rows = []

    t0 = time.time()
    for n_done, (true_key, path) in enumerate(loaded, 1):
        try:
            base = PILImage.open(path).convert("RGB")
        except Exception:
            continue
        true_idx = key_to_idx[true_key]
        true_base = keys_bases[true_idx]

        # --- degradaciones de una sola foto ---
        for name, fn in SINGLE_DEGRADATIONS:
            q = rehash(fn(base))
            d = hamming_all(q, db_bits)
            b1, b3, ex, true_d = eval_row(d, keys_bases, true_base, true_idx)
            r = results[name]
            r["b1"] += int(b1); r["b3"] += int(b3); r["exact"] += int(ex)
            r["true_d"].append(true_d)
            if want_csv:
                csv_rows.append({"key": true_key, "degradation": name,
                                 "base_top1": int(b1), "exact_top1": int(ex),
                                 "true_dist": true_d})

        # --- C) orientación / B-14 (por código base) ---
        b14_total += 1
        rot_imgs = [deg_rot90(base), deg_rot180(base), deg_rot270(base)]
        # Peor caso: llega UNA rotación equivocada. ¿Gana una carta de OTRO código?
        wrong_win_this = False
        for rimg in rot_imgs:
            q = rehash(rimg)
            d = hamming_all(q, db_bits)
            if keys_bases[int(d.argmin())] != true_base:
                wrong_win_this = True
                break
        if wrong_win_this:
            b14_wrong_wins += 1

        # Estrategia matchTopK: 4 orientaciones, mejor distancia por carta.
        # (a) crop PERFECTO (imagen de referencia rotada) — cota superior.
        q_multi = np.stack([rehash(base),
                            rehash(rot_imgs[0]),
                            rehash(rot_imgs[1]),
                            rehash(rot_imgs[2])], axis=0)
        if keys_bases[int(hamming_all_multi(q_multi, db_bits).argmin())] == true_base:
            b14_recovered += 1

        # (b) crop REALISTA: perspectiva imperfecta (6%) + orientación desconocida.
        # Este es el escenario del móvil: Stage-1 no da un recorte perfecto.
        real = deg_persp_mild(base)
        real_rots = [real, deg_rot90(real), deg_rot180(real), deg_rot270(real)]
        q_real = np.stack([rehash(im) for im in real_rots], axis=0)
        if keys_bases[int(hamming_all_multi(q_real, db_bits).argmin())] == true_base:
            b14_recovered_real += 1

        if n_done % 50 == 0:
            rate = n_done / max(time.time() - t0, 0.1)
            print(f"    {n_done}/{len(loaded)}  ({rate:.1f} cartas/s)")

    n = len(loaded)
    print("\n  --- Acierto por degradación (top-1 = mejor candidato) ---")
    print(f"  ('base' = código correcto, criterio del producto · 'exact' = variante exacta)")
    print(f"    {'degradación':14} {'base-1':>7} {'base-3':>7} {'exact-1':>8} {'dist.real(med)':>16}")
    for name, _ in SINGLE_DEGRADATIONS:
        r = results[name]
        med = np.median(r["true_d"]) if r["true_d"] else float("nan")
        print(f"    {name:14} {pct(r['b1']/n):>7} {pct(r['b3']/n):>7} "
              f"{pct(r['exact']/n):>8} {med:>12.0f} bits")

    print("\n" + "=" * 68)
    print(" C) B-14: ORIENTACIÓN DEL RECORTE RECTIFICADO  (por código base)")
    print("=" * 68)
    print(f"  muestra = {b14_total} cartas")
    print(f"  (1) una rotación equivocada hace GANAR a otra carta:")
    print(f"        {b14_wrong_wins}/{b14_total}  ({pct(b14_wrong_wins/b14_total)})"
          f"   ← el fallo B-14 en crudo")
    print(f"  (2) matchTopK (4 rotaciones) recupera top-1, crop PERFECTO:")
    print(f"        {b14_recovered}/{b14_total}  ({pct(b14_recovered/b14_total)})"
          f"   ← cota superior (el recorte es la imagen de referencia)")
    print(f"  (3) matchTopK recupera top-1, crop REALISTA (perspectiva 6% + rot):")
    print(f"        {b14_recovered_real}/{b14_total}  ({pct(b14_recovered_real/b14_total)})"
          f"   ← escenario real del móvil")
    print(f"  → si (2)≈100% pero (3) baja, el cuello de botella es Stage-1 (recorte),")
    print(f"    no Stage-2 (matching): la rotación ya la resuelve matchTopK.")

    if want_csv:
        with open(want_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["key", "degradation", "base_top1",
                                              "exact_top1", "true_dist"])
            w.writeheader()
            w.writerows(csv_rows)
        print(f"\n  [OK] volcado por-carta → {want_csv}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Banco de pruebas del matcher pHash del escáner.")
    ap.add_argument("--sample", type=int, default=300,
                    help="Nº de cartas a simular en B/C (0 = todas). Defecto 300.")
    ap.add_argument("--seed", type=int, default=42, help="Semilla de la muestra.")
    ap.add_argument("--only", choices=["base", "sim", "all"], default="all",
                    help="Qué partes ejecutar.")
    ap.add_argument("--csv", type=str, default="", help="Volcar resultados por-carta a CSV.")
    args = ap.parse_args()

    if not HASHES_PATH.exists():
        print(f"[!] Falta {HASHES_PATH}. Ejecuta antes: python scripts/build_card_database.py --hashes-only")
        sys.exit(1)

    print("Cargando base de hashes precomputados…")
    keys, db_bits, _ = load_hash_db()
    print(f"  {len(keys)} hashes · {N_BITS} bits · algoritmo de build_card_database (paridad garantizada)")

    if args.only in ("base", "all"):
        part_a_discrimination(keys, db_bits)

    if args.only in ("sim", "all"):
        index = bcdb.load_index()
        rng = random.Random(args.seed)
        pool = list(keys)
        if args.sample and args.sample < len(pool):
            sample = rng.sample(pool, args.sample)
        else:
            sample = pool
        part_bc(keys, db_bits, index, sample, args.csv)

    print("\n[DONE]")


if __name__ == "__main__":
    main()
