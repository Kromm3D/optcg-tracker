#!/usr/bin/env python3
"""
build_prices.py
---------------
Mapea las URLs de producto de Cardmarket para cada variante de carta OPTCG.
Genera data/prices.json y lo copia a app/src/data/prices.json.

Solo extrae product_url por variante — sin precios. El objetivo es que el
boton "Ver en Cardmarket" de la app apunte al arte especifico correcto.

ESTRATEGIA:
  1. Scrapea /Expansions para descubrir slugs de expansion automaticamente.
  2. Para cada expansion, pagina /Products/Singles/{slug}?site=N
     y extrae href por variante: "Nami-EB03-053-V1" -> code="EB03-053", suffix=""

USO:
    pip install requests cloudscraper beautifulsoup4
    pip install playwright playwright-stealth && playwright install chromium

    python scripts/build_prices.py                    # todas las expansiones
    python scripts/build_prices.py --browser          # bypass Cloudflare
    python scripts/build_prices.py --slugs Romance-Dawn  # un set de prueba
    python scripts/build_prices.py --dry-run
"""

import argparse
import json
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("Falta 'requests'. Instalalo con:  pip install requests cloudscraper beautifulsoup4")
    sys.exit(1)

try:
    import cloudscraper
    HAS_CLOUDSCRAPER = True
except ImportError:
    HAS_CLOUDSCRAPER = False

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Falta 'beautifulsoup4'. Instalalo con:  pip install requests cloudscraper beautifulsoup4")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------
CM_BASE         = "https://www.cardmarket.com/en/OnePiece"
CM_EXPANSIONS   = CM_BASE + "/Expansions"
CM_SINGLES_BASE = CM_BASE + "/Products/Singles"
CM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8",
}
REQUEST_DELAY      = 1.2
HTTP_TIMEOUT       = 30
MAX_PAGES_PER_SET  = 30

SKIP_PATTERNS = [
    "non-english", "japanese", "asia-region", "promos-",
]

ROOT        = Path(__file__).resolve().parent.parent
DATA_DIR    = ROOT / "data"
INDEX_PATH  = DATA_DIR / "index.json"
PRICES_PATH = DATA_DIR / "prices.json"
APP_PRICES  = ROOT / "app" / "src" / "data" / "prices.json"

# "Nami-EB03-053-V1" -> group(1)="EB03-053", group(2)="1"
PRODUCT_SLUG_RE = re.compile(r"([A-Z]{1,4}\d{2}-\d{3})-V(\d+)")


# ---------------------------------------------------------------------------
# Cliente Playwright (Chromium real — bypassa el JS challenge de Cloudflare)
# ---------------------------------------------------------------------------
class _FakeResp:
    """Adapta la respuesta de Playwright a la interfaz de requests.Response."""
    __slots__ = ("text", "status_code", "ok")

    def __init__(self, html: str, status: int = 200):
        self.text        = html
        self.status_code = status
        self.ok          = 200 <= status < 300


class PlaywrightClient:
    """
    Chromium headless con playwright-stealth. Carga JS, resuelve el challenge
    de Cloudflare y devuelve el HTML final de la pagina. Misma interfaz que
    requests.Session (metodo .get(url, params, timeout) -> _FakeResp).
    """

    def __init__(self, headless: bool = True):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("[!] Playwright no instalado. Ejecuta:")
            print("      pip install playwright playwright-stealth")
            print("      playwright install chromium")
            raise SystemExit(1)

        try:
            from playwright_stealth import stealth_sync
            self._stealth = stealth_sync
        except ImportError:
            self._stealth = None
            print("[!] playwright-stealth no instalado -- sin patches de fingerprint.")
            print("    pip install playwright-stealth  para mejor evasion.")

        mode = "headless" if headless else "visible"
        print("[*] Iniciando Chromium ({})...".format(mode))
        self._pw      = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self._ctx = self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-GB",
            viewport={"width": 1280, "height": 800},
            java_script_enabled=True,
        )
        self._page = self._ctx.new_page()
        if self._stealth:
            self._stealth(self._page)
        print("[*] Chromium listo.")

    def get(self, url, params=None, timeout=HTTP_TIMEOUT):
        from urllib.parse import urlencode
        full = url + ("?" + urlencode(params) if params else "")
        try:
            resp = self._page.goto(full, timeout=timeout * 1000, wait_until="domcontentloaded")
            # Dar tiempo a Cloudflare para resolver su challenge JS si lo hay.
            try:
                self._page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass
            html   = self._page.content()
            status = resp.status if resp else 200
            return _FakeResp(html, status)
        except Exception as e:
            print("  [!] Playwright error: {}".format(e))
            return _FakeResp("", 500)

    def close(self):
        try:
            self._browser.close()
            self._pw.stop()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Cliente HTTP (cloudscraper / requests — rapido, sin browser)
# ---------------------------------------------------------------------------
def make_client(use_browser: bool = False, headless: bool = True):
    if use_browser:
        return PlaywrightClient(headless=headless)
    if HAS_CLOUDSCRAPER:
        client = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        client.headers.update(CM_HEADERS)
        print("[*] cloudscraper activo")
    else:
        print("[!] cloudscraper no instalado -- usando requests estandar")
        client = requests.Session()
        retry = Retry(
            total=3, backoff_factor=1.2,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
        )
        client.mount("https://", HTTPAdapter(max_retries=retry))
        client.headers.update(CM_HEADERS)
    return client


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def version_to_suffix(v):
    n = int(v)
    if n <= 1:
        return ""
    return "_p{}".format(n - 1)


def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# Precio "From" tal como aparece en el listado. Cardmarket usa el formato del
# locale de la SESION, no del path, asi que hay que tragar las dos formas:
#   europea  "1.234,56 €"  /  "12,34 €"
#   anglosajona "1,234.56 €" / "12.34 €"
#
# El patron captura el numero entero con sus separadores y la normalizacion se
# hace despues. Un `\d{1,4}[.,]\d{2}` ingenuo — que es lo que hace hoy
# scripts/scrape_browser_console.js — parte "1.234,56" en "1.23" y convierte
# una carta de 1234 € en una de 1,23 €: un error de tres ordenes de magnitud
# que ademas pasa desapercibido porque el numero resultante es plausible.
PRICE_RE = re.compile(r"(\d[\d.,  ]*\d)\s*€")

# Cuantos ancestros se suben buscando el precio antes de rendirse. El link del
# producto y su precio viven en la misma fila de la tabla, pero cuantos niveles
# hay entre medias depende del ancho de pantalla con el que Cardmarket
# renderizo la pagina. 8 cubre todas las variantes vistas; mas que eso empieza
# a capturar el precio de la fila de al lado.
PRICE_ANCESTOR_LEVELS = 8


def parse_price(text):
    """
    Primer importe en euros de `text`, o None.

    La regla para decidir cual de los separadores es el decimal: el ULTIMO
    separador que venga seguido de exactamente dos digitos. Todo lo demas son
    millares y se tira. Si el ultimo grupo tiene tres digitos ("1.234") no hay
    parte decimal y el numero es entero.
    """
    if not text:
        return None
    m = PRICE_RE.search(text)
    if not m:
        return None

    raw = m.group(1).replace(" ", "").replace(" ", "")
    head, sep, tail = raw.rpartition(".") if raw.rfind(".") > raw.rfind(",") \
        else raw.rpartition(",")

    if sep and len(tail) == 2:
        digits = re.sub(r"[.,]", "", head)
        candidate = "{}.{}".format(digits or "0", tail)
    else:
        candidate = re.sub(r"[.,]", "", raw)

    try:
        return float(candidate)
    except ValueError:
        return None


def price_near(link):
    """
    Precio asociado a un link de producto en el listado, o None.

    Sube por los ancestros hasta dar con un importe — igual que
    scripts/scrape_browser_console.js sobre el DOM vivo — pero **se detiene en
    cuanto el ancestro abarca mas de un producto**.

    Sin ese freno, una carta sin precio acaba devolviendo el de otra fila: al
    subir lo suficiente se llega a un contenedor con el listado entero y el
    regex engancha el primer importe que encuentre. Se comprobo con un DOM de
    prueba y pasaba exactamente eso. Es el peor tipo de fallo posible aqui —
    no revienta, escribe en prices.json un numero plausible pero de otra carta,
    y de ahi va al valor de la coleccion del usuario.
    """
    el = link.parent
    for _ in range(PRICE_ANCESTOR_LEVELS):
        if el is None or el.name in ("body", "html", "[document]"):
            break
        # Mas de un link de producto = hemos salido de la fila de esta carta.
        if len(el.select("a[href*='/Products/Singles/']")) > 1:
            break
        price = parse_price(el.get_text(" ", strip=True))
        if price is not None:
            return price
        el = el.parent
    return None


# Señales de que Cloudflare bloqueó la peticion (en lugar del contenido real).
_CF_SIGNALS = ("Just a moment", "cf-challenge-running", "Checking your browser",
               "Enable JavaScript and cookies to continue")


def fetch_html(client, url, params=None, retries=2):
    for attempt in range(retries + 1):
        try:
            resp = client.get(url, params=params, timeout=HTTP_TIMEOUT)
            if resp.status_code == 429:
                wait = 15 * (attempt + 1)
                print("  [429] Rate limit -- esperando {}s...".format(wait))
                time.sleep(wait)
                continue
            if resp.ok:
                html = resp.text
                if any(s in html for s in _CF_SIGNALS):
                    if attempt < retries:
                        print("  [CF] Challenge detectado, esperando 8s y reintentando...")
                        time.sleep(8)
                        continue
                    print("  [CF] Challenge persistente. Re-ejecuta con --browser para bypass.")
                    return None
                return html
            print("  [!] HTTP {} para {}".format(resp.status_code, url))
            return None
        except Exception as e:
            print("  [!] Error en {}: {}".format(url, e))
            if attempt < retries:
                time.sleep(3)
    return None


# ---------------------------------------------------------------------------
# PASO 1 -- Descubrir slugs
# ---------------------------------------------------------------------------
def discover_slugs(client, delay):
    print("[*] Descubriendo expansiones desde {}".format(CM_EXPANSIONS))
    html = fetch_html(client, CM_EXPANSIONS)
    if not html:
        print("[!] No se pudo cargar la pagina de expansiones.")
        sys.exit(1)

    soup = BeautifulSoup(html, "html.parser")
    slugs = []
    seen = set()
    for a in soup.select('a[href*="/OnePiece/Expansions/"]'):
        href = a.get("href", "")
        if "/Expansions/" not in href:
            continue
        slug = href.split("/Expansions/")[1].strip("/").split("?")[0]
        if not slug or "/" in slug or slug in seen:
            continue
        seen.add(slug)
        if any(p in slug.lower() for p in SKIP_PATTERNS):
            continue
        slugs.append(slug)

    print("    {} expansiones encontradas".format(len(slugs)))
    time.sleep(delay)
    return slugs


# ---------------------------------------------------------------------------
# PASO 2 -- Listing pages
# ---------------------------------------------------------------------------
def scrape_listing(client, slug, known_codes, delay):
    """
    Pagina /Products/Singles/{slug}?site=N y extrae, por variante, el
    product_url y el precio "From" del listado.
    Devuelve { variant_key: {product_url, updated, low?} }
    """
    results = {}
    base_url = "{}/{}".format(CM_SINGLES_BASE, slug)

    for page in range(1, MAX_PAGES_PER_SET + 1):
        params = {"site": page} if page > 1 else {}
        html = fetch_html(client, base_url, params=params)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")

        selector = 'a[href*="/Products/Singles/{}/"]'.format(slug)
        links = [
            a for a in soup.select(selector)
            if PRODUCT_SLUG_RE.search(a.get("href", "").split("/")[-1].split("?")[0])
        ]

        if not links:
            break

        for a in links:
            href = a.get("href", "")
            slug_part = href.split("/Singles/{}/".format(slug))[-1].split("?")[0]
            m = PRODUCT_SLUG_RE.search(slug_part)
            if not m:
                continue

            code   = m.group(1)
            suffix = version_to_suffix(m.group(2))
            key    = "{}{}".format(code, suffix)

            if code not in known_codes:
                continue

            clean_url = href.split("?")[0]
            if not clean_url.startswith("http"):
                clean_url = "https://www.cardmarket.com" + clean_url

            entry = {"product_url": clean_url, "updated": today_str()}
            # `low` solo se escribe si se encontro: una clave con None borraria
            # un precio bueno de una pasada anterior al hacer el update().
            low = price_near(a)
            if low is not None:
                entry["low"] = low
            results[key] = entry

        time.sleep(delay)

        if not soup.select_one('a[aria-label="Next page"]'):
            break

    return results


# ---------------------------------------------------------------------------
# Persistencia
# ---------------------------------------------------------------------------
def load_index_codes():
    if not INDEX_PATH.exists():
        print("[!] No existe {}. Ejecuta primero build_card_database.py.".format(INDEX_PATH))
        sys.exit(1)
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        return set(json.load(f).get("cards", {}).keys())


def load_prices():
    if not PRICES_PATH.exists():
        return {}
    with open(PRICES_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("prices", {})


def save_prices(prices):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source":    "cardmarket.com/en/OnePiece",
        "currency":  "EUR",
        "fetched":   len(prices),
        "prices":    prices,
    }
    with open(PRICES_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print("[OK] Guardado {} ({} entradas)".format(PRICES_PATH, len(prices)))

    if APP_PRICES.parent.exists():
        shutil.copy2(PRICES_PATH, APP_PRICES)
        print("[OK] Copiado a {}".format(APP_PRICES))
    else:
        print("[!] {} no existe -- copia manual.".format(APP_PRICES.parent))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="URLs de producto Cardmarket para OPTCG.")
    parser.add_argument("--all", action="store_true",
                        help="Ignorar cache, re-fetch todo.")
    parser.add_argument("--slugs", nargs="+", metavar="SLUG",
                        help="Solo procesar estos slugs de Cardmarket.")
    parser.add_argument("--delay", type=float, default=REQUEST_DELAY, metavar="SEG",
                        help="Delay entre peticiones (defecto {}).".format(REQUEST_DELAY))
    parser.add_argument("--dry-run", action="store_true",
                        help="Mostrar plan sin hacer peticiones.")
    parser.add_argument("--browser", action="store_true",
                        help="Usar Chromium real (Playwright) para bypass de Cloudflare.")
    parser.add_argument("--no-headless", action="store_true",
                        help="Abrir ventana del navegador visible (mas lento, menos detectable).")
    args = parser.parse_args()

    delay = args.delay

    print("=" * 60)
    print(" Cardmarket price fetcher . One Piece TCG")
    print("=" * 60)

    known_codes = load_index_codes()
    prices      = load_prices()
    print("[*] Indice: {} codigos".format(len(known_codes)))
    print("[*] Cache:  {} entradas".format(len(prices)))

    if args.dry_run:
        print("\n[DRY RUN] Se scrapearian los listings de expansiones para extraer product_url.")
        return

    client = make_client(
        use_browser=args.browser,
        headless=not args.no_headless,
    )
    try:
        time.sleep(delay)

        # Paso 1: slugs
        if args.slugs:
            slugs = args.slugs
            print("[*] Slugs manuales: {}".format(slugs))
        else:
            slugs = discover_slugs(client, delay)

        # Paso 2: listings
        print("\n[PASO 2] Listing pages ({} expansiones)".format(len(slugs)))
        new_entries = {}
        for i, slug in enumerate(slugs, 1):
            print("  [{}/{}] {}".format(i, len(slugs), slug))
            entries = scrape_listing(client, slug, known_codes, delay)
            if entries:
                print("    -> {} cartas".format(len(entries)))
                new_entries.update(entries)
            else:
                print("    -> sin resultados")
            time.sleep(delay)

        prices.update(new_entries)
        print("\n[*] Total: {} entradas".format(len(prices)))

        save_prices(prices)
        print("\n[DONE]")

    finally:
        # Cierra el browser si usamos Playwright (no-op para requests/cloudscraper).
        if hasattr(client, "close"):
            client.close()


if __name__ == "__main__":
    main()
