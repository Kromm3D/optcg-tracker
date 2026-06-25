#!/usr/bin/env python3
"""
build_card_database.py
----------------------
Construye la base de datos de cartas de One Piece TCG scrapeando el SITIO
OFICIAL (https://en.onepiece-cardgame.com/cardlist/) y genera:

  - data/index.json               -> índice de todas las cartas y sus variantes
  - images/<SET>/<CODE>[_pN].webp -> imágenes (descarga opcional en paralelo)

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
    max 480px ancho, guarda como WebP q80 (≈40% más pequeño que JPEG 82 al
    mismo nivel de calidad visual). WebP soporta transparencia nativamente.
    Por defecto NO hace falta: el repo ya trae las imágenes; esta fase solo es
    útil para sets nuevos o después de --wipe.

  Fase 3 (build_hashes):
    Recorre el índice y las imágenes descargadas para calcular un *average hash*
    de 64 bits por variante (hash_size=8). Lo guarda en data/hashes.json.
    Este fichero se copia a app/src/data/ para que el escáner de arte pueda
    comparar fotos de cámara contra la base de datos sin red ni ML.

USO:
    pip install requests beautifulsoup4 pillow imagehash
    python build_card_database.py                    # las 3 fases (pregunta si wipe)
    python build_card_database.py --index-only       # solo fase 1 (metadatos)
    python build_card_database.py --images-only      # solo fase 2 (usa index.json existente)
    python build_card_database.py --hashes-only      # solo fase 3 (genera hashes.json)
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

try:
    import imagehash
except ImportError:
    imagehash = None

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
HASHES_PATH = DATA_DIR / "hashes.json"
META_PATH = DATA_DIR / "meta.json"
BOXART_DIR = IMAGES_DIR / "boxart"
BOXART_MANIFEST_PATH = DATA_DIR / "boxArt.json"
PRODUCTS_URL = "https://en.onepiece-cardgame.com/products/"

# Incrementa si el SHAPE de IndexPayload cambia de forma incompatible (campos
# requeridos nuevos, renombrados, etc). El cliente remoto rechaza un índice
# cuyo schema_version no entiende en vez de aplicarlo a ciegas.
INDEX_SCHEMA_VERSION = 1

# Configuración de compresión de imágenes
MAX_IMG_WIDTH = 480   # ancho máximo en píxeles (LANCZOS si es mayor)
WEBP_QUALITY  = 80    # calidad WebP 0-100 (80 ≈ JPEG 90, ~35% más pequeño que JPEG 82)


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


def set_codes_from_label(label):
    """Extrae los códigos de set del texto de una opción del desplegable.

    Maneja códigos simples '[OP-01]' y compuestos '[OP15-EB04]' (booster que
    incluye cartas de dos series a la vez).

    Ejemplos:
      '-ROMANCE DAWN- [OP-01]'       -> ['OP01']
      '-ADVENTURE ON KAMI- [OP15-EB04]' -> ['OP15', 'EB04']
      'Promotion card'               -> []
    """
    # Código compuesto: [LETRAS+DIGITOS-LETRAS+DIGITOS] p.ej. [OP15-EB04]
    m = re.search(r"\[([A-Z]+)(\d+)-([A-Z]+)(\d+)\]", label)
    if m:
        c1 = f"{m.group(1)}{int(m.group(2)):02d}"
        c2 = f"{m.group(3)}{int(m.group(4)):02d}"
        return [c1, c2]
    # Código simple: [XX-NN] p.ej. [OP-01], [PRB-02], [ST-16]
    m = re.search(r"\[([A-Z]+)-0*(\d+)\]", label)
    if m:
        return [f"{m.group(1)}{int(m.group(2)):02d}"]
    return []


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


def set_code_from_getinfo(raw):
    """Extrae el codigo de set autoritativo del corchete '[Card Set(s)]'.

    Esta es la fuente FIABLE de a que set pertenece CADA variante concreta,
    independiente de en que pagina/serie se haya scrapeado. Ejemplos:
      '-Memorial Collection- [EB-01]'  -> 'EB01'
      '-Anime 25th Collection- [EB-02]'-> 'EB02'  (Gold Leader reimpreso)
      '-THE TIME OF BATTLE- [OP-16]'   -> 'OP16'

    Solo reconoce corchetes simples 'LL-NN'. Los compuestos (p.ej. '[OP14-EB04]')
    o los promos sin corchete (p.ej. 'Treasure Cup November') devuelven '' para
    que el caller caiga al prefijo del codigo de la carta."""
    if not raw:
        return ""
    m = re.search(r"\[([A-Z]+)-0*(\d+)\]", raw)
    if not m:
        return ""
    return f"{m.group(1)}{int(m.group(2)):02d}"


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
    (<code><suffix>), usamos ESE (compatibilidad con .jpg existentes servidos
    via jsDelivr). Si no existe (imagen nueva), usamos .webp."""
    set_prefix = set_prefix_of(code)
    stem = f"{code}{suffix}"
    existing = _local_files_for_set(set_prefix).get(stem)
    if existing:
        return existing
    # Nueva imagen → WebP
    return f"images/{set_prefix}/{stem}.webp"


# ---------------------------------------------------------------------------
# FASE 1 — Descubrir series y scrapear cada una
# ---------------------------------------------------------------------------
def discover_series(session):
    """Parsea el <select> de series del sitio.

    Devuelve [(series_id, label, set_codes)] donde set_codes son los codigos
    de set extraídos del corchete del label (p.ej. ['OP01'] o ['OP15','EB04']).
    Las opciones del desplegable aparecen en orden cronológico INVERSO
    (índice 0 = set más reciente), lo que usamos como release_order.
    """
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
        codes = set_codes_from_label(label)
        series.append((val, label, codes))
    print(f"    {len(series)} series encontradas")
    return series


def build_set_meta(series):
    """Construye el mapa de metadatos por set a partir del orden del desplegable.

    release_order: entero donde 0 = set más reciente. Los sets sin entrada en
    el desplegable (como promos sueltos) reciben un orden muy alto (999) para
    aparecer al final.
    """
    set_meta = {}
    for rank, (_sid, _label, codes) in enumerate(series):
        for code in codes:
            if code not in set_meta:   # primera aparición gana (rank más bajo = más nuevo)
                set_meta[code] = {"release_order": rank}
    return set_meta


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
            "set_code": set_code_from_getinfo(getinfo_txt),
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
        printed_set_code = c.get("set_code") or None
        variant = {
            "suffix": suffix,
            "label": variant_label(suffix, c["rarity"]),
            "rarity": c["rarity"],
            "full_name": c["name"],
            "image_local": image_local,
            "image_source": c["image_source"],
            "set_source": printed_set_code or set_prefix_of(code),
            "printed_set": printed_set_code,
            "get_info": c["set_name"] or "",
        }
        existing_suffixes = {v["suffix"] for v in entry["variants"]}
        if suffix not in existing_suffixes:
            entry["variants"].append(variant)

    # Ordenar variantes: base ("") -> paralelas (_p1, _p2…) -> reprints (_r1…) -> resto
    for entry in index.values():
        entry["variants"].sort(key=_variant_sort_key)

    return index


def _variant_sort_key(v):
    s = v["suffix"]
    if s == "":
        return (0, 0)
    inner = s.lstrip("_")   # "p1", "r1", etc.
    if inner.startswith("p"):
        try:
            return (1, int(inner[1:]))
        except ValueError:
            return (1, 999)
    if inner.startswith("r"):
        try:
            return (2, int(inner[1:]))
        except ValueError:
            return (2, 999)
    return (3, 0)


def scrape_all(session):
    """Recorre todas las series y devuelve (cartas_crudas, set_meta)."""
    series = discover_series(session)
    set_meta = build_set_meta(series)
    all_cards = []
    for i, (sid, label, _codes) in enumerate(series, 1):
        try:
            html, url = fetch_series_html(session, sid)
            cards = parse_cards(html, url)
            all_cards.extend(cards)
            print(f"  [{i}/{len(series)}] {label[:48]:48}  {len(cards)} cartas")
        except Exception as e:
            print(f"  [{i}/{len(series)}] {label[:48]:48}  [!] FALLO: {e}")
        time.sleep(REQUEST_DELAY)
    return all_cards, set_meta


def save_index(index, set_meta=None):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    set_meta = set_meta or {}
    version = int(time.time())
    payload = {
        "generated_with": "build_card_database.py",
        "source": "https://en.onepiece-cardgame.com/cardlist/",
        "schema_version": INDEX_SCHEMA_VERSION,
        "version": version,
        "card_count": len(index),
        "set_meta": set_meta,
        "cards": index,
    }
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[OK] Índice guardado en {INDEX_PATH}  ({len(index)} códigos únicos)")

    # meta.json: ficherito aparte para que el cliente compruebe si hay una
    # versión nueva sin tener que descargar los ~3-4MB de index.json entero.
    newest_set = min(set_meta, key=lambda c: set_meta[c]["release_order"]) if set_meta else None
    meta_payload = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "version": version,
        "card_count": len(index),
        "newest_set": newest_set,
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta_payload, f, ensure_ascii=False)
    print(f"[OK] Meta guardado en {META_PATH}  (version={version}, newest_set={newest_set})")

    # Copiar a la app (mismo patrón que hashes.json) para que el bundle
    # tenga su propia versión/schema de referencia al arrancar offline.
    app_meta = ROOT / "app" / "src" / "data" / "meta.json"
    if app_meta.parent.exists():
        import shutil
        shutil.copy2(META_PATH, app_meta)
        print(f"[OK] Copiado a {app_meta}")


def load_index():
    if not INDEX_PATH.exists():
        print(f"[!] No existe {INDEX_PATH}. Ejecuta primero la fase 1.")
        sys.exit(1)
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("cards", {})


# ---------------------------------------------------------------------------
# Box art — key art / main visual del set ("mv.webp"), "mejor esfuerzo segun disponibilidad"
# ---------------------------------------------------------------------------
# El sitio oficial SOLO mantiene viva la página de producto del set vigente
# (/products/<slug>.html). En cuanto un set nuevo lo sustituye, la página (y
# su imagen) desaparecen — no hay archivo histórico. Por eso esto descarga lo
# que encuentre EN ESTE RUN y lo acumula con lo ya guardado de runs
# anteriores; nunca borra lo que ya tenemos aunque el set rote fuera del
# listado. La mayoría de sets antiguos simplemente nunca tendrán box art.
# Patrón del key visual: "mv.webp", "pc/mv.webp", "mv_01.jpg"… (NO "bg_mv",
# que es solo el fondo difuminado). Cubre el formato nuevo (.webp con variante
# pc/sp) y el viejo (mv_NN.jpg).
_MV_RE = re.compile(r"""['"\s(]([^'"\s()]*\bmv(?:_\d+)?\.(?:webp|jpg|png))""", re.IGNORECASE)


def discover_product_pages(session):
    """Devuelve el conjunto de URLs de páginas de producto, combinando la
    portada de /products/ (set vigente, .html) con los tres archivos por
    subcategoría (?subcategory=boosters|decks|others, .php). El archivo es la
    clave: cubre sets recientes ya rotados de la portada, no solo el vigente."""
    pages = set()
    sources = [PRODUCTS_URL] + [f"{PRODUCTS_URL}?subcategory={s}" for s in ("boosters", "decks", "others")]
    for src in sources:
        try:
            resp = session.get(src, timeout=HTTP_TIMEOUT)
            resp.raise_for_status()
        except Exception as e:
            print(f"    [!] No se pudo abrir {src}: {e}")
            continue
        for a in BeautifulSoup(resp.text, "html.parser").select("a[href]"):
            href = a["href"]
            if re.search(r"/products/[a-z0-9_-]+\.html?$", href, re.I) or \
               re.search(r"/products/(?:boosters|decks|other)/[^/]+\.php$", href, re.I):
                pages.add(urljoin(PRODUCTS_URL, href))
    return pages


def fetch_box_art_image_url(session, product_url):
    """Abre una página de producto y devuelve la URL absoluta de su key visual
    (mv.webp / pc/mv.webp / mv_01.jpg…), prefiriendo la variante 'pc' y el
    .webp. None si la página no expone ninguno."""
    try:
        resp = session.get(product_url, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except Exception:
        return None
    hits = [u for u in _MV_RE.findall(resp.text) if "bg_mv" not in u.lower()]
    if not hits:
        return None
    def rank(u):
        u = u.lower()
        return (0 if "/pc/" in u else 1, 0 if u.endswith("mv.webp") else 1, 0 if ".webp" in u else 1)
    return urljoin(product_url, sorted(hits, key=rank)[0].split("?")[0])


def set_codes_from_slug(slug):
    """Mapea el slug de la página a los códigos de set que cubre.
    'op10' -> [OP10]; 'op14-eb04' -> [OP14, EB04]; 'st15-20' -> [ST15..ST20]
    (un número suelto tras un prefijo es el fin de un rango con ese prefijo)."""
    codes, prefix, last_num = [], None, None
    for part in slug.lower().split("-"):
        m = re.match(r"^([a-z]+)?(\d+)$", part)
        if not m:
            continue
        pre, num = m.group(1), int(m.group(2))
        if pre:
            prefix = pre.upper()
            codes.append(f"{prefix}{num:02d}")
            last_num = num
        elif prefix is not None and last_num is not None and num > last_num:
            # rango: rellena prefix(last_num+1)..prefix(num)
            codes.extend(f"{prefix}{n:02d}" for n in range(last_num + 1, num + 1))
            last_num = num
    return codes


def _boxart_files_on_disk():
    """Devuelve {code: version} de los webp versionados en disco.

    Los ficheros se nombran "{code}.{version}.webp" (la versión va en el PATH,
    no en un query ?v=). jsDelivr resuelve "@main" a un commit y cachea esa
    resolución por región hasta 12h; un query distinto NO esquiva eso. Un path
    nuevo, en cambio, no existe en ningún caché → fuerza un fetch fresco. Por
    eso la versión vive en el nombre del fichero."""
    out = {}
    if not BOXART_DIR.exists():
        return out
    for p in BOXART_DIR.glob("*.webp"):
        parts = p.stem.split(".")  # "OP16.1782381877" -> ["OP16", "1782381877"]
        if len(parts) != 2:
            continue  # ignora nombres planos legacy "OP16.webp"
        code, ver = parts
        try:
            out[code] = int(ver)
        except ValueError:
            continue
    return out


def fetch_box_art(session, known_set_codes):
    """Descarga el box art (key art "mv.webp") de los sets vigentes en
    /products/ y mantiene un manifest (boxArt.json) con TODO lo que haya en
    disco, no solo lo de este run, para no perder el art de un set que ya rotó
    fuera del listado.

    Cada fichero se guarda como "{code}.{version}.webp" (versión = timestamp).
    Para ACTUALIZAR el art de un set (p.ej. si el sitio cambia la imagen),
    borra a mano el "{code}.*.webp" viejo y vuelve a ejecutar: se re-descarga
    con una versión nueva → path nuevo → ningún caché lo tiene → se ve al
    instante en cliente y CDN."""
    print(f"[*] Buscando box art en {PRODUCTS_URL} (+ archivos por subcategoría)")
    pages = discover_product_pages(session)
    print(f"    {len(pages)} páginas de producto encontradas")

    # Mapea cada código de set conocido a la URL de su key visual. Varias
    # páginas pueden compartir arte (op14-eb04 → OP14+EB04), y varios sets
    # pueden compartir la misma imagen → se agrupa para descargar una sola vez.
    code_to_url = {}
    for page in sorted(pages):
        slug = re.sub(r"\.(php|html?)$", "", page.rsplit("/", 1)[-1])
        codes = [c for c in set_codes_from_slug(slug) if c in known_set_codes]
        if not codes:
            continue
        img_url = fetch_box_art_image_url(session, page)
        time.sleep(REQUEST_DELAY)
        if not img_url:
            continue
        for code in codes:
            code_to_url.setdefault(code, img_url)
    print(f"    {len(code_to_url)} sets del índice con key art disponible")

    BOXART_DIR.mkdir(parents=True, exist_ok=True)
    existing = _boxart_files_on_disk()
    # Descarga agrupada por URL: una imagen que sirve a N sets se baja una vez
    # y se escribe en el fichero versionado de cada set que aún no lo tenga.
    by_url = {}
    for code, url in code_to_url.items():
        if code not in existing:
            by_url.setdefault(url, []).append(code)
    for img_url, codes in by_url.items():
        ts = int(time.time())
        first = codes[0]
        dest = BOXART_DIR / f"{first}.{ts}.jpg"  # download_one lo guarda como .webp
        ok, err = download_one(session, img_url, dest)
        print(f"    {'[OK]' if ok else '[!]'} {','.join(codes)}: {img_url}" + (f" — {err}" if err else ""))
        if ok:
            src_webp = dest.with_suffix(".webp")
            for other in codes[1:]:
                import shutil as _sh
                _sh.copy2(src_webp, BOXART_DIR / f"{other}.{ts}.webp")
        time.sleep(REQUEST_DELAY)

    versions = _boxart_files_on_disk()
    available = sorted(versions.keys())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(BOXART_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump({"sets": available, "versions": versions}, f, ensure_ascii=False)
    print(f"[OK] {len(available)} sets con box art en total -> {BOXART_MANIFEST_PATH}")

    app_manifest = ROOT / "app" / "src" / "data" / "boxArt.json"
    if app_manifest.parent.exists():
        import shutil
        shutil.copy2(BOXART_MANIFEST_PATH, app_manifest)
        print(f"[OK] Copiado a {app_manifest}")


# ---------------------------------------------------------------------------
# Compresión de imágenes
# ---------------------------------------------------------------------------
def to_webp_ready(img):
    """Normaliza el modo de imagen a RGB o RGBA para guardar como WebP.

    WebP soporta RGBA nativamente (transparencia sin compositing).
    Los modos P (paleta con transparencia) se convierten a RGBA; el resto a RGB.
    """
    if img.mode in ("RGB", "RGBA"):
        return img
    if img.mode == "P" and "transparency" in img.info:
        return img.convert("RGBA")
    return img.convert("RGB")


def resize_if_needed(img, max_width=MAX_IMG_WIDTH):
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
    """Descarga, redimensiona y guarda una imagen como WebP.

    - Descarga desde URL
    - Redimensiona a max MAX_IMG_WIDTH px de ancho (LANCZOS)
    - Normaliza a RGB/RGBA (WebP soporta transparencia nativamente)
    - Guarda como WebP q80 con method=6 (mejor compresión)
      → ~35% más pequeño que JPEG 82 a calidad visual equivalente
    """
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        r = session.get(url, timeout=HTTP_TIMEOUT)
        if not (r.ok and r.content):
            return False, f"HTTP {r.status_code}"

        img = PILImage.open(io.BytesIO(r.content))
        img = to_webp_ready(img)
        img = resize_if_needed(img)

        dest_webp = dest.with_suffix(".webp")
        tmp = dest_webp.with_suffix(".webp.tmp")
        img.save(tmp, "WEBP", quality=WEBP_QUALITY, method=6)
        tmp.replace(dest_webp)
        return True, None
    except Exception as e:
        return False, str(e)


def download_all(index, workers=8):
    tasks = collect_download_tasks(index)
    if not tasks:
        print("[OK] Nada que descargar (todas las imágenes ya están en disco).")
        return

    print(f"[*] {len(tasks)} imágenes pendientes → WebP {WEBP_QUALITY}q / {MAX_IMG_WIDTH}px · {workers} hilos")
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

    # Actualizar el índice para que todas las rutas apunten a .webp
    print("[*] Actualizando index.json para apuntar a imágenes .webp...")
    for code, entry in index.items():
        for variant in entry.get("variants", []):
            loc = variant.get("image_local", "")
            if loc and not loc.endswith(".webp"):
                variant["image_local"] = loc.rsplit(".", 1)[0] + ".webp"


# ---------------------------------------------------------------------------
# FASE 3 — Generar hashes perceptuales de las imágenes
# ---------------------------------------------------------------------------
HASH_SIZE = 16  # 16×16 = 256 bits → mucho más discriminante que 8×8

# Recorte de la ILUSTRACIÓN (fracciones de la carta: [x, y, w, h]). Hasheamos solo
# la parte superior del arte — por encima de la marca "SAMPLE" y del cuadro de
# efecto (texto dependiente del idioma). Al ser fraccional, es independiente de la
# resolución y se aplica igual a la imagen de referencia y al recorte rectificado
# del escáner. DEBE coincidir con ART_CROP en app/src/lib/phash.ts.
ART_CROP = (0.05, 0.05, 0.90, 0.38)

# Sin máscara de filas: la banda "SAMPLE" cae por debajo de ART_CROP, así que los
# 768 bits son informativos. Se conserva la maquinaria de enmascarado (conjunto
# vacío) por si un recorte futuro volviera a incluir la marca de agua. DEBE
# coincidir con MASK_ROWS en app/src/lib/phash.ts.
MASK_ROWS = range(0, 0)  # vacío
_MASKED_INDEX = frozenset(r * HASH_SIZE + c for r in MASK_ROWS for c in range(HASH_SIZE))

# Filtro de remuestreo equivalente al de imagehash.average_hash (LANCZOS).
_LANCZOS = getattr(getattr(PILImage, "Resampling", PILImage), "LANCZOS")


def _crop_art(channel):
    """Recorta el canal a la región ART_CROP (fracciones de su tamaño)."""
    w, h = channel.size
    x, y, cw, ch = ART_CROP
    box = (round(x * w), round(y * h), round((x + cw) * w), round((y + ch) * h))
    return channel.crop(box)


def _channel_average_hash_masked(channel):
    """average_hash de un canal 'L' recortado a la ilustración (ART_CROP).

    Replica imagehash.average_hash(hash_size=16) — resize LANCZOS, umbral por la
    media, empaquetado row-major de 4 bits por nibble (MSB primero) — pero primero
    recorta a ART_CROP, normaliza min-max a [0,255] (invariante a brillo) y calcula
    la media sólo sobre las celdas NO enmascaradas, forzando a 0 los bits
    enmascarados (conjunto vacío con el recorte actual).
    Coincide bit a bit con channelHash() en app/src/lib/phash.ts."""
    small = _crop_art(channel).convert("L").resize((HASH_SIZE, HASH_SIZE), _LANCZOS)
    pixels = list(small.tobytes())  # row-major, 256 valores (1 byte/píxel en 'L')

    # Normalización min-max por canal: hace el hash invariante a brillo/contraste.
    # DEBE coincidir con normalizeChannel() en app/src/lib/phash.ts.
    mn, mx = min(pixels), max(pixels)
    if mx > mn:
        pixels = [round((p - mn) * 255 / (mx - mn)) for p in pixels]

    kept = [p for i, p in enumerate(pixels) if i not in _MASKED_INDEX]
    mean = sum(kept) / len(kept)

    bits = [
        0 if i in _MASKED_INDEX else (1 if p > mean else 0)
        for i, p in enumerate(pixels)
    ]
    out = []
    for i in range(0, len(bits), 4):
        nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
        out.append(format(nibble, "x"))
    return "".join(out)


def rgb_average_hash(img):
    """24-bit average hash: un average_hash por plano R, G, B concatenado (R‖G‖B).

    Discrimina cartas con el mismo layout pero distinto color — el punto débil del
    ahash en escala de grises. La banda central (sello SAMPLE) va enmascarada.
    Debe coincidir bit a bit con computeAhash() en app/src/lib/phash.ts (mismo
    orden de canales, empaquetado y máscara)."""
    rgb = img.convert("RGB")
    return "".join(
        _channel_average_hash_masked(channel)
        for channel in rgb.split()  # (R, G, B) como imágenes 'L'
    )


def build_hashes(index):
    """Calcula el rgb_average_hash (3 × HASH_SIZE² bits) de cada variante."""
    if imagehash is None:
        print("[!] Falta 'imagehash'. Instálalo con:  pip install imagehash")
        print("    Saltando generación de hashes.")
        return

    print(f"[FASE 3] Generando hashes perceptuales (rgb_average_hash_artcrop_norm {ART_CROP}, 3×{HASH_SIZE}×{HASH_SIZE})")
    hashes = {}
    skipped = 0
    for code, entry in index.items():
        for v in entry.get("variants", []):
            rel = v.get("image_local", "")
            if not rel:
                skipped += 1
                continue
            img_path = ROOT / rel
            if not img_path.exists():
                skipped += 1
                continue
            try:
                img = PILImage.open(img_path)
                key = f"{code}{v['suffix']}"
                hashes[key] = rgb_average_hash(img)
            except Exception as e:
                skipped += 1
                print(f"    [!] {code}{v['suffix']}: {e}")

    payload = {
        "hash_algo": "rgb_average_hash_artcrop_norm",
        "hash_size": HASH_SIZE,
        "art_crop": list(ART_CROP),
        "masked_rows": list(MASK_ROWS),
        "hash_count": len(hashes),
        "hashes": hashes,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(HASHES_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    print(f"[OK] {len(hashes)} hashes guardados en {HASHES_PATH}  (saltados: {skipped})")

    # Copiar a la app (mismo patrón que build_embeddings.py) para mantener sincronía.
    app_hashes = ROOT / "app" / "src" / "data" / "hashes.json"
    if app_hashes.parent.exists():
        import shutil
        shutil.copy2(HASHES_PATH, app_hashes)
        print(f"[OK] Copiado a {app_hashes}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Constructor de base de datos OPTCG (sitio oficial, 3 fases).")
    parser.add_argument("--index-only", action="store_true", help="Solo construir el índice (metadatos).")
    parser.add_argument("--images-only", action="store_true", help="Solo descargar imágenes (usa index.json existente).")
    parser.add_argument("--hashes-only", action="store_true", help="Solo generar hashes perceptuales (usa index.json existente).")
    parser.add_argument("--workers", type=int, default=8, help="Hilos paralelos para descargar (defecto 8).")
    parser.add_argument("--wipe", action="store_true", help="Borrar index.json anterior sin preguntar.")
    parser.add_argument("--no-boxart", action="store_true", help="No intentar descargar box art de /products/.")
    args = parser.parse_args()

    exclusive = sum([args.index_only, args.images_only, args.hashes_only])
    if exclusive > 1:
        print("[!] --index-only, --images-only y --hashes-only son mutuamente excluyentes.")
        sys.exit(2)

    print("=" * 60)
    print(" Constructor de base de datos · One Piece TCG (sitio oficial)")
    print("=" * 60)

    # Si --hashes-only, solo generar hashes y salir
    if args.hashes_only:
        index = load_index()
        build_hashes(index)
        print("\n[DONE]")
        return

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
        cards, set_meta = scrape_all(session)
        print(f"[*] Total recogido: {len(cards)} entradas (variantes incluidas)")
        if not cards:
            print("[!] Sin datos. Revisa la conexión o si cambió el HTML del sitio.")
            sys.exit(1)
        index = build_index(cards)
        save_index(index, set_meta)
        with_variants = sum(1 for c in index.values() if len(c["variants"]) > 1)
        print(f"     Códigos únicos: {len(index)} · con variantes: {with_variants}")

        if not args.no_boxart:
            try:
                print("\n[FASE 1.5] Box art de sets vigentes")
                fetch_box_art(session, set(set_meta.keys()))
            except Exception as e:
                print(f"[!] Box art falló (no crítico, se continúa): {e}")
    else:
        index = load_index()

    # Fase 2
    if not args.index_only:
        print("\n[FASE 2] Descargando imágenes en paralelo")
        download_all(index, workers=args.workers)

    # Fase 3
    if not args.index_only and not args.images_only:
        print()
        build_hashes(index)

    print("\n[DONE]")


if __name__ == "__main__":
    main()
