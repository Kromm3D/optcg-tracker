#!/usr/bin/env python3
"""
build_card_database.py
----------------------
Descarga datos e imágenes de cartas de One Piece TCG desde la OPTCG API
(https://www.optcgapi.com) y construye:

  - data/index.json               -> índice de todas las cartas y sus variantes
  - images/<SET>/<CODE>[_pN].png  -> imágenes (descargadas en paralelo)

Diseño en DOS FASES SEPARADAS:

  Fase 1 (build_index):
    Llama a los endpoints de listado de la API (pocas peticiones, una pausa
    cortés entre ellas) y construye el índice completo en memoria. Lo guarda
    en disco INMEDIATAMENTE. Esta fase es muy rápida (segundos).

  Fase 2 (download_images):
    Recorre el índice y descarga las imágenes en PARALELO con un pool de
    hilos. Las imágenes vienen del CDN de OPTCG (no del VPS de la API), así
    que se puede paralelizar tranquilamente sin abusar de nadie. Reintenta
    los fallos pasajeros y salta las imágenes ya descargadas (es reanudable).

USO:
    pip install requests
    python build_card_database.py                    # ambas fases
    python build_card_database.py --index-only       # solo fase 1
    python build_card_database.py --images-only      # solo fase 2 (usa index.json existente)
    python build_card_database.py --workers 16       # ajustar paralelismo (defecto 8)
"""

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("Falta 'requests'. Instálalo con:  pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
API_BASE = "https://optcgapi.com/api"
HEADERS = {"User-Agent": "optcg-card-db-builder/2.0 (community card scanner)"}
API_DELAY = 0.5           # pausa entre llamadas a la API (sé amable con el VPS)
HTTP_TIMEOUT = 30

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
DATA_DIR = ROOT / "data"
INDEX_PATH = DATA_DIR / "index.json"

# Endpoints de listado por categoría
LIST_ENDPOINTS = {
    "sets":   "/allSetCards/",
    "decks":  "/allSTCards/",
    "promos": "/allPromoCards/",
    "don":    "/allDonCards/",
}


# ---------------------------------------------------------------------------
# Sesión HTTP con reintentos automáticos a nivel transporte
# ---------------------------------------------------------------------------
def make_session():
    s = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.8,   # 0.8s, 1.6s, 3.2s entre reintentos
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update(HEADERS)
    return s


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def pick(d, *keys, default=None):
    """Devuelve el primer campo presente entre varias claves posibles.
    La API no siempre nombra los campos igual entre categorías."""
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return default


def derive_variant_suffix(card_id, image_id):
    """De card_id='OP01-001' e image_id='OP01-001_p1' deriva '_p1'."""
    if not image_id or image_id == card_id:
        return ""
    if image_id.startswith(card_id):
        return image_id[len(card_id):]
    return ""


def safe_filename(image_id):
    return image_id.replace("/", "_").replace("\\", "_") + ".png"


def local_image_path(card_id, image_id):
    set_prefix = card_id.split("-")[0] if "-" in card_id else "OTHER"
    return f"images/{set_prefix}/{safe_filename(image_id or card_id)}"


# ---------------------------------------------------------------------------
# FASE 1 — Construir el índice
# ---------------------------------------------------------------------------
def fetch_all_cards(session):
    """Llama a cada endpoint de listado y devuelve la lista completa de cartas."""
    all_cards = []
    for category, endpoint in LIST_ENDPOINTS.items():
        url = API_BASE + endpoint
        print(f"[*] Listado de '{category}' ...")
        try:
            resp = session.get(url, timeout=HTTP_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  [!] Falló {category}: {e}")
            time.sleep(API_DELAY)
            continue

        # La respuesta puede ser lista directa o dict con una lista dentro
        if isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    data = v
                    break
        if not isinstance(data, list):
            print(f"  [!] Formato inesperado en {category}")
            time.sleep(API_DELAY)
            continue

        for card in data:
            card["_category"] = category
        all_cards.extend(data)
        print(f"    {len(data)} cartas")
        time.sleep(API_DELAY)

    return all_cards


def build_index(cards):
    """Agrupa las cartas por código base con sus variantes."""
    index = {}
    for card in cards:
        card_id = pick(card, "card_set_id", "card_id", "id", "cardId")
        if not card_id:
            continue
        image_id = pick(card, "card_image_id", "image_id", "imageId", default=card_id)
        name = pick(card, "card_name", "name", "cardName", default="")
        rarity = pick(card, "rarity", "card_rarity", default="")
        img_url = pick(card, "card_image", "image", "image_url", "imageUrl")

        suffix = derive_variant_suffix(card_id, image_id)
        variant_label = "Normal" if suffix == "" else f"Alt/Variante ({suffix})"

        entry = index.setdefault(card_id, {"code": card_id, "name": name, "variants": []})
        if name and not entry["name"]:
            entry["name"] = name

        variant = {
            "suffix": suffix,
            "label": variant_label,
            "rarity": rarity,
            "image_id": image_id,
            "image_local": local_image_path(card_id, image_id),
            "image_source": img_url or "",
        }
        if not any(v["image_id"] == variant["image_id"] for v in entry["variants"]):
            entry["variants"].append(variant)

    return index


def save_index(index):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_with": "build_card_database.py",
        "source": "https://www.optcgapi.com",
        "card_count": len(index),
        "cards": index,
    }
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[OK] Índice guardado en {INDEX_PATH}  ({len(index)} códigos únicos)")


def load_index():
    if not INDEX_PATH.exists():
        print(f"[!] No existe {INDEX_PATH}. Ejecuta primero la fase 1.")
        sys.exit(1)
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("cards", {})


# ---------------------------------------------------------------------------
# FASE 2 — Descargar imágenes en paralelo
# ---------------------------------------------------------------------------
def collect_download_tasks(index):
    """Aplana el índice en una lista (url, ruta_local) de imágenes pendientes."""
    tasks = []
    for code, entry in index.items():
        for v in entry.get("variants", []):
            url = v.get("image_source")
            rel = v.get("image_local")
            if not url or not rel:
                continue
            dest = ROOT / rel
            if dest.exists() and dest.stat().st_size > 0:
                continue  # ya descargada → reanudable
            tasks.append((url, dest))
    return tasks


def download_one(session, url, dest):
    """Descarga una imagen. Devuelve (ok, mensaje)."""
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        r = session.get(url, timeout=HTTP_TIMEOUT)
        if r.ok and r.content:
            # Guardado atómico: escribir en .tmp y renombrar
            tmp = dest.with_suffix(dest.suffix + ".tmp")
            tmp.write_bytes(r.content)
            tmp.replace(dest)
            return True, None
        return False, f"HTTP {r.status_code}"
    except Exception as e:
        return False, str(e)


def download_all(index, workers=8):
    tasks = collect_download_tasks(index)
    if not tasks:
        print("[OK] Nada que descargar (todas las imágenes ya están en disco).")
        return

    print(f"[*] {len(tasks)} imágenes pendientes · {workers} hilos en paralelo")
    session = make_session()
    done = 0
    failed = []
    start = time.time()

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(download_one, session, url, dest): (url, dest)
                   for url, dest in tasks}
        for fut in as_completed(futures):
            url, dest = futures[fut]
            ok, err = fut.result()
            done += 1
            if not ok:
                failed.append((url, err))
            if done % 25 == 0 or done == len(tasks):
                rate = done / max(time.time() - start, 0.1)
                print(f"  {done}/{len(tasks)}  ({rate:.1f}/s)  fallos: {len(failed)}")

    if failed:
        print(f"\n[!] {len(failed)} descargas fallaron. Vuelve a ejecutar para reintentar.")
        for u, e in failed[:5]:
            print(f"    · {u}  ->  {e}")
        if len(failed) > 5:
            print(f"    · ... y {len(failed) - 5} más")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Constructor de base de datos OPTCG (2 fases).")
    parser.add_argument("--index-only", action="store_true", help="Solo construir el índice.")
    parser.add_argument("--images-only", action="store_true", help="Solo descargar imágenes (usa index.json existente).")
    parser.add_argument("--workers", type=int, default=8, help="Hilos paralelos para descargar (defecto 8).")
    args = parser.parse_args()

    if args.index_only and args.images_only:
        print("[!] --index-only y --images-only son mutuamente excluyentes.")
        sys.exit(2)

    print("=" * 60)
    print(" Constructor de base de datos · One Piece TCG")
    print("=" * 60)

    # Fase 1
    if not args.images_only:
        session = make_session()
        print("\n[FASE 1] Construyendo índice desde la API")
        cards = fetch_all_cards(session)
        print(f"[*] Total recogido: {len(cards)} entradas")
        if not cards:
            print("[!] Sin datos. Revisa los endpoints o tu conexión.")
            sys.exit(1)
        index = build_index(cards)
        save_index(index)
        with_variants = sum(1 for c in index.values() if len(c["variants"]) > 1)
        print(f"     Códigos únicos: {len(index)} · con variantes: {with_variants}")
    else:
        index = load_index()

    # Fase 2
    if not args.index_only:
        print("\n[FASE 2] Descargando imágenes en paralelo")
        download_all(index, workers=args.workers)

    print("\n[DONE]")


if __name__ == "__main__":
    main()
