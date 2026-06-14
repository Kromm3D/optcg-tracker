#!/usr/bin/env python3
"""
visualize_hashes.py
-------------------
Genera visualizaciones del hash perceptual enmascarado para depurar el escáner.

Produce dos ficheros PNG en scripts/output/:
  1. hash_grid_<CODE>.png  — para cada carta de muestra: imagen original +
     rejilla 16×16 superpuesta (filas enmascaradas en rojo), y los bits
     R / G / B como mosaico de colores.
  2. discrimination_matrix.png — matriz de distancias Hamming entre las
     cartas de muestra para verificar que se discriminan bien entre sí.

Uso:
    cd D:/Tools/OPTCG-Collector
    python scripts/visualize_hashes.py
"""

from pathlib import Path
import json, sys
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from PIL import Image as PILImage

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SCRIPTS  = ROOT / "scripts"
OUT_DIR  = SCRIPTS / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

HASH_SIZE  = 16
ART_CROP   = (0.05, 0.05, 0.90, 0.38)  # debe coincidir con build_card_database.py
MASK_ROWS  = range(0, 0)                # vacío: SAMPLE excluido por ART_CROP
_LANCZOS   = getattr(getattr(PILImage, "Resampling", PILImage), "LANCZOS")

# Cartas de muestra — una selección variada (Leaders, Commons, Parallels)
SAMPLE_CODES = [
    "OP01-001",   # Roronao Zoro Leader (rojo)
    "OP01-001_p1",# Zoro parallel
    "OP01-002",   # carta distinta del mismo set
    "OP01-003",
    "OP14-033",
    "OP02-001",
]

# ── Helpers ──────────────────────────────────────────────────────────────────

def crop_art(img: PILImage.Image) -> PILImage.Image:
    """Recorta a la región ART_CROP (fracciones del tamaño)."""
    w, h = img.size
    x, y, cw, ch = ART_CROP
    return img.crop((round(x * w), round(y * h), round((x + cw) * w), round((y + ch) * h)))


def channel_hash_bits(channel_img: PILImage.Image) -> np.ndarray:
    """Devuelve la rejilla 16×16 de bits (0/1) sobre el recorte ART_CROP."""
    small  = crop_art(channel_img).convert("L").resize((HASH_SIZE, HASH_SIZE), _LANCZOS)
    pixels = np.array(small, dtype=np.float32).flatten()

    mask   = np.zeros(HASH_SIZE * HASH_SIZE, dtype=bool)
    for r in MASK_ROWS:
        mask[r * HASH_SIZE:(r + 1) * HASH_SIZE] = True

    mean   = pixels[~mask].mean()
    bits   = np.where(mask, 0, (pixels > mean).astype(np.uint8))
    return bits.reshape(HASH_SIZE, HASH_SIZE)


def hamming(hex_a: str, hex_b: str) -> int:
    dist = 0
    for ca, cb in zip(hex_a, hex_b):
        x = int(ca, 16) ^ int(cb, 16)
        dist += bin(x).count("1")
    return dist


def load_image(code: str):
    """Busca la imagen WebP del código (con o sin sufijo)."""
    # El código puede ser "OP01-001" o "OP01-001_p1"
    if "_" in code and not code.startswith("_"):
        base, suffix = code.split("_", 1)
        set_id = base.split("-")[0]
        path = ROOT / "images" / set_id / f"{code}.webp"
    else:
        set_id = code.split("-")[0]
        path = ROOT / "images" / set_id / f"{code}.webp"
    if not path.exists():
        return None
    return PILImage.open(path).convert("RGB")


# ── 1. Hash grid visualization ────────────────────────────────────────────────

def visualize_card_hash(code: str, hash_hex: str | None):
    img = load_image(code)
    if img is None:
        print(f"  [skip] imagen no encontrada para {code}")
        return

    r_ch, g_ch, b_ch = img.split()
    bits_r = channel_hash_bits(r_ch)
    bits_g = channel_hash_bits(g_ch)
    bits_b = channel_hash_bits(b_ch)

    fig = plt.figure(figsize=(14, 5), facecolor="#0e0c1a")
    fig.suptitle(f"Hash perceptual (ART_CROP) — {code}",
                 color="white", fontsize=13, fontweight="bold", y=0.97)

    # ── Columna 1: recorte ART_CROP con rejilla superpuesta ──
    art = crop_art(img)
    ax_img = fig.add_subplot(1, 4, 1)
    ax_img.imshow(art)
    ax_img.set_title("Recorte ART_CROP\n(ilustración hasheada)", color="white", fontsize=9)
    ax_img.axis("off")

    iw, ih = art.size
    cell_w = iw / HASH_SIZE
    cell_h = ih / HASH_SIZE
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            masked = row in MASK_ROWS
            color  = (1, 0, 0, 0.35) if masked else (1, 1, 1, 0.08)
            rect   = patches.Rectangle(
                (col * cell_w, row * cell_h), cell_w, cell_h,
                linewidth=0.3, edgecolor="white", facecolor=color, alpha=0.9 if masked else 0.4,
            )
            ax_img.add_patch(rect)

    # Leyenda de máscara
    ax_img.text(2, ih - 8, "█ enmascarado (SAMPLE)",
                color="red", fontsize=6.5, va="bottom")

    # ── Columnas 2-4: bits R, G, B ──
    channel_data = [
        (bits_r, "Canal R (rojo)",    "Reds"),
        (bits_g, "Canal G (verde)",   "Greens"),
        (bits_b, "Canal B (azul)",    "Blues"),
    ]
    for i, (bits, title, cmap) in enumerate(channel_data):
        ax = fig.add_subplot(1, 4, i + 2)

        # Fondo enmascarado en gris oscuro, bits activos en el color del canal
        display = bits.astype(float).copy()
        # Marcar las filas enmascaradas con un valor especial (-0.3)
        for row in MASK_ROWS:
            display[row, :] = -0.3

        ax.imshow(display, cmap=cmap, vmin=-0.3, vmax=1,
                  interpolation="nearest", aspect="auto")
        ax.set_title(title, color="white", fontsize=9)
        ax.set_xticks([])
        ax.set_yticks(range(HASH_SIZE))
        ax.set_yticklabels(range(HASH_SIZE), fontsize=5, color="#aaa")
        ax.tick_params(length=0)

        # Líneas divisorias de filas enmascaradas (ninguna con ART_CROP)
        for row in MASK_ROWS:
            ax.axhline(row - 0.5, color="red", linewidth=0.7, alpha=0.6)
        if list(MASK_ROWS):
            ax.axhline(list(MASK_ROWS)[-1] + 0.5, color="red", linewidth=0.7, alpha=0.6)

        # Porcentaje de bits activos (excluyendo enmascarados)
        unmasked = np.array([bits[r, :] for r in range(HASH_SIZE) if r not in MASK_ROWS])
        pct = unmasked.mean() * 100
        ax.set_xlabel(f"{int(unmasked.sum())}/{unmasked.size} bits activos ({pct:.0f}%)",
                      color="#aaa", fontsize=7)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    out = OUT_DIR / f"hash_grid_{code.replace('_', '-')}.png"
    plt.savefig(out, dpi=130, bbox_inches="tight", facecolor="#0e0c1a")
    plt.close()
    print(f"  [OK] {out.name}")


# ── 2. Discrimination matrix ──────────────────────────────────────────────────

def discrimination_matrix(hashes: dict):
    # Filtrar los códigos de muestra que existen en el JSON
    codes = [c for c in SAMPLE_CODES if c in hashes]
    if len(codes) < 2:
        print("  [skip] no hay suficientes cartas de muestra en el JSON")
        return

    n    = len(codes)
    dist = np.zeros((n, n), dtype=int)
    for i, a in enumerate(codes):
        for j, b in enumerate(codes):
            dist[i, j] = hamming(hashes[a], hashes[b])

    fig, ax = plt.subplots(figsize=(max(6, n * 0.9), max(5, n * 0.8)),
                           facecolor="#0e0c1a")
    fig.suptitle("Matriz de distancias Hamming entre cartas de muestra\n"
                 "(menor = más similares · 0 = idénticas · máx 768 bits informativos)",
                 color="white", fontsize=11, fontweight="bold")

    im = ax.imshow(dist, cmap="RdYlGn_r", vmin=0, vmax=300, interpolation="nearest")
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(codes, rotation=35, ha="right", color="white", fontsize=8)
    ax.set_yticklabels(codes, color="white", fontsize=8)
    ax.tick_params(colors="white", length=0)

    for i in range(n):
        for j in range(n):
            val = dist[i, j]
            color = "white" if val > 150 else "black"
            ax.text(j, i, str(val), ha="center", va="center",
                    fontsize=9, fontweight="bold", color=color)

    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.ax.yaxis.set_tick_params(color="white")
    plt.setp(cbar.ax.yaxis.get_ticklabels(), color="white", fontsize=8)
    cbar.set_label("Distancia Hamming (bits)", color="white", fontsize=9)

    ax.set_facecolor("#1e1a30")
    plt.tight_layout()
    out = OUT_DIR / "discrimination_matrix.png"
    plt.savefig(out, dpi=130, bbox_inches="tight", facecolor="#0e0c1a")
    plt.close()
    print(f"  [OK] {out.name}")


# ── 3. Hash strip comparison (normal vs parallel) ────────────────────────────

def hash_strip_comparison(hashes: dict):
    """Compara la franja de hash de una carta normal vs su paralela."""
    pairs = [("OP01-001", "OP01-001_p1"), ("OP01-002", "OP01-003")]
    valid = [(a, b) for a, b in pairs if a in hashes and b in hashes]
    if not valid:
        return

    fig, axes = plt.subplots(len(valid), 2, figsize=(10, len(valid) * 2.5),
                             facecolor="#0e0c1a")
    if len(valid) == 1:
        axes = [axes]

    fig.suptitle("Comparación de hashes: normal vs variante\n"
                 "(las diferencias de bits son la señal de discriminación)",
                 color="white", fontsize=11, fontweight="bold")

    for row_idx, (code_a, code_b) in enumerate(valid):
        hex_a = hashes[code_a]
        hex_b = hashes[code_b]
        d     = hamming(hex_a, hex_b)

        # Convertir hex completo (192 chars) a array de bits
        def hex_to_bits_full(h):
            bits = []
            for ch in h:
                v = int(ch, 16)
                bits.extend([(v >> (3 - i)) & 1 for i in range(4)])
            return np.array(bits).reshape(3, HASH_SIZE, HASH_SIZE)  # R,G,B x 16x16

        ba = hex_to_bits_full(hex_a)
        bb = hex_to_bits_full(hex_b)

        # Mosaico RGB concatenado horizontalmente
        strip_a = np.concatenate([ba[0], ba[1], ba[2]], axis=1).astype(float)
        strip_b = np.concatenate([bb[0], bb[1], bb[2]], axis=1).astype(float)

        # Filas enmascaradas a gris
        for r in MASK_ROWS:
            strip_a[r, :] = 0.4
            strip_b[r, :] = 0.4

        for col_idx, (strip, code) in enumerate([(strip_a, code_a), (strip_b, code_b)]):
            ax = axes[row_idx][col_idx]
            ax.imshow(strip, cmap="viridis", vmin=0, vmax=1,
                      interpolation="nearest", aspect="auto")
            ax.set_title(f"{code}", color="white", fontsize=9)
            ax.set_xlabel("R · G · B (bits concatenados)", color="#aaa", fontsize=7)
            ax.set_xticks([])
            ax.set_yticks(range(HASH_SIZE))
            ax.set_yticklabels(range(HASH_SIZE), fontsize=5, color="#aaa")
            ax.tick_params(length=0)
            for r in MASK_ROWS:
                ax.axhline(r - 0.5, color="red", linewidth=0.6, alpha=0.5)
            ax.set_facecolor("#1e1a30")

        axes[row_idx][0].set_ylabel(f"Hamming: {d} bits", color="#4ec98b", fontsize=9)

    plt.tight_layout()
    out = OUT_DIR / "hash_strip_comparison.png"
    plt.savefig(out, dpi=130, bbox_inches="tight", facecolor="#0e0c1a")
    plt.close()
    print(f"  [OK] {out.name}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    hashes_path = DATA_DIR / "hashes.json"
    if not hashes_path.exists():
        print(f"[ERROR] No se encuentra {hashes_path}")
        sys.exit(1)

    with open(hashes_path, encoding="utf-8") as f:
        data = json.load(f)

    hashes = data["hashes"]
    print(f"Cargados {len(hashes)} hashes ({data.get('hash_algo','?')})")
    print(f"Filas enmascaradas: {data.get('masked_rows','?')}")
    print(f"Generando visualizaciones en {OUT_DIR} …\n")

    print("1/3 — Rejillas de hash por carta:")
    for code in SAMPLE_CODES:
        if code in hashes:
            visualize_card_hash(code, hashes[code])
        else:
            print(f"  [skip] {code} no está en el JSON")

    print("\n2/3 — Matriz de discriminación:")
    discrimination_matrix(hashes)

    print("\n3/3 — Comparación de tiras de hash (normal vs variante):")
    hash_strip_comparison(hashes)

    print(f"\n¡Listo! Abre {OUT_DIR} para ver los PNG.")


if __name__ == "__main__":
    main()
