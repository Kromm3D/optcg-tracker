#!/usr/bin/env python3
"""
build_card_database.py
----------------------
Construye la base de datos de cartas de One Piece TCG scrapeando el SITIO
OFICIAL (https://en.onepiece-cardgame.com/cardlist/) y genera:

  - data/index.json               -> índice de todas las cartas y sus variantes
  - images/<SET>/<CODE>[_pN].xxx  -> imágenes (descarga opcional en paralelo)

Diseño en DOS FASES SEPARADAS:

  Fase 1 (build_index):
    1) Descubre TODAS las series del desplegable de la web (boosters OP, EB,
       PRB, starter decks ST, promos, etc.).
    2) Pide una página por serie (?series=<ID>) — cada página trae TODAS las
       cartas de esa serie renderizadas en HTML (sin paginación).
    3) Parsea cada carta con BeautifulSoup y construye el índice en memoria,
       agrupando variantes (alt art / parallel) por código base.
    Guarda el índice en disco al terminar. Pausa cortés entre series.

  Fase 2 (download_images):
    Recorre el índice y descarga las imágenes oficiales en PARALELO. Salta las
    que ya existen en disco (reanudable). DURANTE LA DESCARGA: redimensiona a
    max 480px ancho, convierte a RGB, guarda como JPEG q82 (75% más pequeño).
    Por defecto NO hace falta: el repo ya trae las imágenes; esta fase solo es
    útil para sets nuevos o después de --wipe.

USO:
    pip install requests beautifulsoup4
    python build_card_database.py                    # ambas fases (pregunta si wipe)
    python build_card_database.py --index-only       # solo fase 1 (metadatos)
    python build_card_database.py --images-only      # solo fase 2 (usa index.json existente)
    python build_card_database.py --workers 16       # ajustar paralelismo (defecto 8)
    python build_card_database.py --wipe             # borrar index anterior sin preguntar
"""

import argparse
import io
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("Falta 'requests'. Instálalo con:  pip install requests beautifulsoup4")
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Falta 'beautifulsoup4'. Instálalo con:  pip install requests beautifulsoup4")
    sys.exit(1)

try:
    from PIL import Image as PILImage
except ImportError:
    print("Falta 'pillow'. Instálalo con:  pip install pillow")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
SITE_BASE = "https://en.onepiece-cardgame.com"
CARDLIST_URL = SITE_BASE + "/cardlist/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; optcg-card-db-builder/3.0; community card scanner)"
}
REQUEST_DELAY = 0.6       # pausa entre páginas de serie (sé amable con la web oficial)
HTTP_TIMEOUT = 30

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"
DATA_DIR = ROOT / "data"
INDEX_PATH = DATA_DIR / "index.json"


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
# Utilidades de parseo de valores
# ---------------------------------------------------------------------------
def _parse_int(val):
    """Convierte '5', '5000', '-', '' a int o None."""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    s = str(val).strip()
    if not s or s == "-":
        return None
    m = re.search(r"-?\d+", s)
    return int(m.group(0)) if m else None


def _split_color(val):
    """Normaliza el color. La web oficial usa 'Red' o 'Red/Green' (multicolor)."""
    if not val:
        return []
    s = str(val).strip()
    if not s:
        return []
    for sep in ("/", "&", ",", "|"):
        if sep in s:
            return [p.strip() for p in s.split(sep) if p.strip()]
    return [s]


def title_type(raw):
    """LEADER -> Leader, CHARACTER -> Character, etc."""
    if not raw:
        return ""
    return raw.strip().title()


def split_code(dl_id):
    """De 'OP16-001_p1' devuelve (base='OP16-001', suffix='_p1').
    De 'OP16-001' devuelve ('OP16-001', '')."""
    dl_id = (dl_id or "").strip()
    if "_" in dl_id:
        base, rest = dl_id.split("_", 1)
        return base, "_" + rest
    return dl_id, ""


def set_prefix_of(code):
    """OP16-001 -> OP16. P-001 -> P. ST01-001 -> ST01."""
    return code.split("-")[0] if "-" in code else (code or "OTHER")


def clean_set_name(raw):
    """De '-THE TIME OF BATTLE- [OP-16]' deja 'THE TIME OF BATTLE'."""
    if not raw:
        return ""
    s = raw.strip()
    # Quitar el sufijo entre corchetes [OP-16]
    s = re.sub(r"\[[^\]]*\]\s*$", "", s).strip()
    # Quitar guiones decorativos de los extremos
    s = s.strip("-").strip()
    return s


def extract_trigger(effect):
    """Extrae el segmento '[Trigger] ...' del texto de efecto si existe."""
    if not effect:
        return ""
    m = re.search(r"\[Trigger\]\s*(.+)$", effect, re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else ""


def variant_label(suffix, rarity):
    """Etiqueta legible de la variante a partir del sufijo."""
    if suffix == "":
        return "Normal"
    s = suffix.lstrip("_")
    if s.startswith("p"):
        return "Parallel"
    if s.startswith("r"):
        return "Reprint"
    return f"Variante ({s})"


# ---------------------------------------------------------------------------
# Resolución de la imagen local contra los ficheros que ya hay en el repo
# ---------------------------------------------------------------------------
_LOCAL_INDEX_CACHE = {}


def _local_files_for_set(set_prefix):
    """Mapa {stem -> ruta_relativa} de los ficheros existentes en images/<SET>/."""
    if set_prefix in _LOCAL_INDEX_CACHE:
        return _LOCAL_INDEX_CACHE[set_prefix]
    mapping = {}
    set_dir = IMAGES_DIR / set_prefix
    if set_dir.is_dir():
        for f in set_dir.iterdir():
            if f.is_file():
                mapping[f.stem] = f"images/{set_prefix}/{f.name}"
    _LOCAL_INDEX_CACHE[set_prefix] = mapping
    return mapping


def resolve_image_local(code, suffix, img_url):
    """Devuelve la ruta local de la imagen para esta variante.

    Prioridad: si ya existe un fichero en images/<SET>/ con el mismo stem
    (<code><suffix>), usamos ESE (preserva el .jpg/.png que ya sirve la app via
    jsDelivr). Si no existe (set nuevo), caemos al basename oficial (.png)."""
    set_prefix = set_prefix_of(code)
    stem = f"{code}{suffix}"
    existing = _local_files_for_set(set_prefix).get(stem)
    if existing:
        return existing
    # Fallback: usar el nombre del fichero de la URL oficial (sin query)
    if img_url:
        name = img_url.rsplit("/", 1)[-1].split("?", 1)[0]
        if name:
            return f"images/{set_prefix}/{name}"
    return f"images/{set_prefix}/{stem}.png"


# ---------------------------------------------------------------------------
# FASE 1 — Descubrir series y scrapear cada una
# ---------------------------------------------------------------------------
def discover_series(session):
    """Parsea el <select> de series del sitio. Devuelve [(series_id, label)]."""
    print(f"[*] Descubriendo series desde {CARDLIST_URL}")
    resp = session.get(CARDLIST_URL, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Buscar el select que contenga options con value numérico de serie.
    series = []
    seen = set()
    for opt in soup.select("select option"):
        val = (opt.get("value") or "").strip()
        if not val.isdigit():
            continue
        if val in seen:
            continue
        # Texto limpio de la etiqueta (los <br> se vuelven espacios)
        label = opt.get_text(" ", strip=True)
        seen.add(val)
        series.append((val, label))
    print(f"    {len(series)} series encontradas")
    return series


def fetch_series_html(session, series_id):
    """GET de la página de una serie. Devuelve (html, url)."""
    url = f"{CARDLIST_URL}?series={series_id}"
    resp = session.get(url, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.text, url


def _div_text(node, selector):
    """Texto de un div tipo '<div class="x"><h3>Label</h3>VALUE</div>',
    devolviendo solo VALUE (quita el <h3>)."""
    el = node.select_one(selector)
    if not el:
        return ""
    h3 = el.find("h3")
    if h3:
        h3.extract()
    return el.get_text(" ", strip=True)


def parse_cards(html, page_url):
    """Itera los <dl class="modalCol"> de una página y devuelve dicts crudos."""
    soup = BeautifulSoup(html, "html.parser")
    cards = []
    for dl in soup.select("dl.modalCol"):
        dl_id = dl.get("id", "")
        if not dl_id:
            continue
        base, suffix = split_code(dl_id)

        # infoCol -> [code, rarity, type]
        spans = dl.select(".infoCol span")
        rarity = spans[1].get_text(strip=True) if len(spans) > 1 else ""
        ctype = spans[2].get_text(strip=True) if len(spans) > 2 else ""

        name_el = dl.select_one(".cardName")
        name = name_el.get_text(" ", strip=True) if name_el else ""

        # imagen
        img = dl.select_one(".frontCol img")
        raw_src = (img.get("data-src") or img.get("src") or "") if img else ""
        img_url = urljoin(page_url, raw_src).split("?", 1)[0] if raw_src else ""

        # .cost vale 'Life' (líderes) o 'Cost'
        cost_txt = _div_text(dl, ".cost")
        power_txt = _div_text(dl, ".power")
        counter_txt = _div_text(dl, ".counter")
        color_txt = _div_text(dl, ".color")
        block_txt = _div_text(dl, ".block")
        feature_txt = _div_text(dl, ".feature")
        effect_txt = _div_text(dl, ".text")
        getinfo_txt = _div_text(dl, ".getInfo")

        attr_el = dl.select_one(".attribute i")
        attribute = attr_el.get_text(strip=True) if attr_el else ""

        cards.append({
            "base": base,
            "suffix": suffix,
            "name": name,
            "rarity": rarity,
            "type": title_type(ctype),
            "colors": _split_color(color_txt),
            "cost": _parse_int(cost_txt),
            "power": _parse_int(power_txt),
            "counter": _parse_int(counter_txt),
            "attribute": attribute,
            "effect": effect_txt,
            "trigger": extract_trigger(effect_txt),
            "set_name": clean_set_name(getinfo_txt),
            "family": feature_txt,
            "block": block_txt,
            "image_source": img_url,
        })
    return cards


def build_index(cards):
    """Agrupa las cartas por código base con sus variantes."""
    index = {}
    for c in cards:
        code = c["base"]
        if not code:
            continue
        entry = index.setdefault(code, {
            "code": code,
            "name": c["name"],
            "colors": c["colors"],
            "cost": c["cost"],
            "power": c["power"],
            "counter": c["counter"],
            "type": c["type"],
            "attribute": c["attribute"],
            "effect": c["effect"],
            "trigger": c["trigger"],
            "set_name": c["set_name"],
            "family": c["family"],
            "block": c["block"],
            "variants": [],
        })
        # Rellenar campos a nivel carta si faltaban
        for k in ("name", "type", "attribute", "effect", "trigger",
                  "set_name", "family", "block"):
            if c[k] and not entry.get(k):
                entry[k] = c[k]
        for k in ("colors",):
            if c[k] and not entry.get(k):
                entry[k] = c[k]
        for k in ("cost", "power", "counter"):
            if c[k] is not None and entry.get(k) is None:
                entry[k] = c[k]

        suffix = c["suffix"]
        image_local = resolve_image_local(code, suffix, c["image_source"])
        variant = {
            "suffix": suffix,
            "label": variant_label(suffix, c["rarity"]),
            "rarity": c["rarity"],
            "full_name": c["name"],
            "image_local": image_local,
            "image_source": c["image_source"],
        }
        existing_suffixes = {v["suffix"] for v in entry["variants"]}
        if suffix not in existing_suffixes:
            entry["variants"].append(variant)

    return index


def scrape_all(session):
    """Recorre todas las series y devuelve la lista completa de cartas crudas."""
    series = discover_series(session)
    all_cards = []
    for i, (sid, label) in enumerate(series, 1):
        try:
            html, url = fetch_series_html(session, sid)
            cards = parse_cards(html, url)
            all_cards.extend(cards)
            print(f"  [{i}/{len(series)}] {label[:48]:48}  {len(cards)} cartas")
        except Exception as e:
            print(f"  [{i}/{len(series)}] {label[:48]:48}  [!] FALLO: {e}")
        time.sleep(REQUEST_DELAY)
    return all_cards


def save_index(index):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_with": "build_card_database.py",
        "source": "https://en.onepiece-cardgame.com/cardlist/",
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
# Compresión de imágenes
# ---------------------------------------------------------------------------
def to_rgb(img):
    """Convierte cualquier modo a RGB, compositing transparencia sobre blanco."""
    if img.mode == "RGB":
        return img
    if img.mode == "RGBA":
        bg = PILImage.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        return bg
    # P (palette), L (greyscale), CMYK, etc.
    return img.convert("RGB")


def resize_if_needed(img, max_width=480):
    """Redimensiona si el ancho excede max_width, manteniendo aspecto."""
    if img.width <= max_width:
        return img
    ratio = max_width / img.width
    new_h = round(img.height * ratio)
    return img.resize((max_width, new_h), PILImage.LANCZOS)


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
    """Descarga, comprime y guarda una imagen como JPEG.

    - Descarga desde URL
    - Redimensiona a max 480px de ancho (LANCZOS)
    - Convierte a RGB (compositing transparencia)
    - Guarda como JPEG q82
    """
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        r = session.get(url, timeout=HTTP_TIMEOUT)
        if not (r.ok and r.content):
            return False, f"HTTP {r.status_code}"

        # Abrir imagen desde bytes, comprimir, guardar como JPEG
        img = PILImage.open(io.BytesIO(r.content))
        img = to_rgb(img)
        img = resize_if_needed(img, max_width=480)

        # Cambiar extensión a .jpg si no lo es
        dest_jpg = dest.with_suffix('.jpg')
        tmp = dest_jpg.with_suffix(dest_jpg.suffix + ".tmp")
        img.save(tmp, "JPEG", quality=82, optimize=True)
        tmp.replace(dest_jpg)
        return True, None
    except Exception as e:
        return False, str(e)


def download_all(index, workers=8):
    tasks = collect_download_tasks(index)
    if not tasks:
        print("[OK] Nada que descargar (todas las imágenes ya están en disco).")
        return

    print(f"[*] {len(tasks)} imágenes pendientes (se comprimen a JPEG 82q/480px) · {workers} hilos")
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
    else:
        print("\n[OK] Todas las imágenes descargadas y comprimidas.")

    # Actualizar el índice para que todas las imágenes apunten a .jpg
    print("[*] Actualizando index.json para apuntar a imágenes .jpg...")
    for code, entry in index.items():
        for variant in entry.get("variants", []):
            loc = variant.get("image_local", "")
            if loc and not loc.endswith(".jpg"):
                variant["image_local"] = loc.rsplit(".", 1)[0] + ".jpg"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Constructor de base de datos OPTCG (sitio oficial, 2 fases).")
    parser.add_argument("--index-only", action="store_true", help="Solo construir el índice (metadatos).")
    parser.add_argument("--images-only", action="store_true", help="Solo descargar imágenes (usa index.json existente).")
    parser.add_argument("--workers", type=int, default=8, help="Hilos paralelos para descargar (defecto 8).")
    parser.add_argument("--wipe", action="store_true", help="Borrar index.json anterior sin preguntar.")
    args = parser.parse_args()

    if args.index_only and args.images_only:
        print("[!] --index-only y --images-only son mutuamente excluyentes.")
        sys.exit(2)

    print("=" * 60)
    print(" Constructor de base de datos · One Piece TCG (sitio oficial)")
    print("=" * 60)

    # Si --index-only (o no --images-only), preguntar sobre el wipe si el index existe
    if not args.images_only and INDEX_PATH.exists():
        if args.wipe:
            print(f"\n[*] --wipe activo: eliminando {INDEX_PATH}")
            INDEX_PATH.unlink()
            _LOCAL_INDEX_CACHE.clear()
        else:
            print(f"\n[!] Ya existe {INDEX_PATH}")
            ans = input("    ¿Borrar el índice anterior y reconstruir desde cero? (s/n): ").strip().lower()
            if ans in ("s", "si", "yes", "y"):
                print("    Eliminando...")
                INDEX_PATH.unlink()
                _LOCAL_INDEX_CACHE.clear()
            else:
                print("    Manteniendo el índice existente (se sobrescribirá con los datos nuevos).")

    # Fase 1
    if not args.images_only:
        session = make_session()
        print("\n[FASE 1] Scrapeando el sitio oficial")
        cards = scrape_all(session)
        print(f"[*] Total recogido: {len(cards)} entradas (variantes incluidas)")
        if not cards:
            print("[!] Sin datos. Revisa la conexión o si cambió el HTML del sitio.")
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
