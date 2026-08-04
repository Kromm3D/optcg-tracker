#!/usr/bin/env python3
"""
build_prices_bulk.py
---------------------
Precios de Cardmarket para OPTCG, sin scraping.

Cardmarket publica a diario un catalogo de productos y una guia de precios
por juego en un bucket S3 publico -- SIN Cloudflare delante, a diferencia del
sitio web (ver news.cardmarket.com/en/Magic/were-making-the-price-guide-and-
product-catalogue-available-for-download). idGame=18 es One Piece Card Game
(confirmado a mano: el primer producto es "Roronoa Zoro (OP01-001)").

    https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json
    https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json

EL PROBLEMA QUE RESUELVE ESTE SCRIPT (y por que no es un simple GET+parse):
Cardmarket cataloga cada *reimpresion* de una carta (structure decks, box
toppers, promos de torneo...) como un idProduct distinto, todos con el mismo
nombre visible "Carta (OP01-001)". Nuestro indice solo modela las variantes
que el propio listado oficial de cartas distingue (Normal/Parallel de la
edicion base, y a veces una reimpresion posterior con su propio suffix). No
hay ningun campo en el JSON que diga "esto es la V1 de la edicion base" --
hay que inferirlo.

Heuristica usada (deliberadamente conservadora -- prefiere dejar una variante
sin precio a asignarle el precio de otra):
  1. Para cada codigo, se agrupan sus idProduct por idExpansion.
  2. Se toma SOLO el grupo con el dateAdded mas antiguo -- la edicion base.
     Los grupos mas nuevos (reimpresiones) se ignoran: no hay forma fiable de
     saber a cual de nuestras variantes (si es que a alguna) corresponden.
  3. Dentro de ese grupo, se ordena por idProduct ascendente y se empareja
     1:1, en orden, con las primeras N variantes del codigo en nuestro
     indice (N = tamano del grupo). Verificado a mano con Roronoa Zoro
     OP01-001: el idProduct mas bajo del grupo base es la Normal (2,48 EUR
     de trend), el siguiente es la Parallel (630 EUR de trend) -- coincide
     con el orden Normal/Parallel de nuestras variantes.
  4. Si el grupo base tiene MAS productos que variantes tengamos (raro, pero
     posible si Cardmarket separa foil/non-foil como productos aparte), el
     sobrante se descarta en vez de adivinar.

Resultado esperado: precio para el print base (Normal + Parallel) de la
inmensa mayoria de cartas. Reimpresiones (raras) se quedan sin precio real y
caen al fallback por rareza de app/src/lib/prices.ts -- igual que hoy.

USO:
    python scripts/build_prices_bulk.py
    python scripts/build_prices_bulk.py --dry-run
"""

import argparse
import json
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

ID_GAME = 18  # One Piece Card Game en Cardmarket -- verificado a mano, no hay endpoint que lo liste.

PRODUCTS_URL = f"https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_{ID_GAME}.json"
PRICES_URL   = f"https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_{ID_GAME}.json"

ROOT        = Path(__file__).resolve().parent.parent
DATA_DIR    = ROOT / "data"
INDEX_PATH  = DATA_DIR / "index.json"
PRICES_PATH = DATA_DIR / "prices.json"
APP_PRICES  = ROOT / "app" / "src" / "data" / "prices.json"

HTTP_TIMEOUT = 30

# "Roronoa Zoro (OP01-001)" -> "OP01-001". "Nefeltari Vivi (P-044)" -> "P-044".
# \d{0,2} (no \d{2} fijo) porque los codigos promo son "P-044", sin numero de set.
CODE_RE = re.compile(r"\(([A-Z]{1,4}\d{0,2}-\d{3})\)\s*$")


def fetch_json(url):
    resp = requests.get(url, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def load_index_variants():
    """code -> [suffix, ...] en el orden del indice (base primero)."""
    if not INDEX_PATH.exists():
        print(f"[!] No existe {INDEX_PATH}. Ejecuta primero build_card_database.py.")
        sys.exit(1)
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        cards = json.load(f).get("cards", {})
    return {code: [v["suffix"] for v in card.get("variants", [])] for code, card in cards.items()}


def load_existing_prices():
    if not PRICES_PATH.exists():
        return {}
    with open(PRICES_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("prices", {})


# Tope absoluto para aceptar un swap idioma JP->EN (ver mas abajo). Puesto a
# mano tras auditar el catalogo entero: de 750 candidatos a swap, 37 disparan
# a precios de 3-5 cifras (500€-50000€) por colar un producto no relacionado
# (promos de torneo, errores de catalogacion) en vez de la pareja de idioma
# real -- ver P-031 en AGENTS.md, un caso real que llegaba a 50000€. Cardmarket
# no tiene "ediciones EN caras de verdad" por debajo de esto para cartas base;
# si un swap propuesto supera el tope, se descarta (se queda con el grupo mas
# antiguo, que en el peor caso da un precio JP demasiado BAJO -- un fallo mas
# seguro que uno demasiado ALTO, que contamina vault value / P&L del usuario).
MAX_SWAP_PRICE = 100.0


def _ordered_prices(group, price_by_id):
    """[precio, ...] de un grupo, en el mismo orden idProduct usado para
    emparejar con las variantes -- para poder comparar posicion a posicion."""
    ordered = sorted(group, key=lambda p: p["idProduct"])
    out = []
    for p in ordered:
        entry = price_by_id.get(p["idProduct"]) or {}
        out.append(entry.get("low") or entry.get("trend") or 0.0)
    return out


def match_products_to_variants(products, variants_by_code, price_by_id):
    """
    idProduct -> (code, suffix), emparejando en orden con las variantes de
    cada codigo dentro de UN SOLO grupo (code, idExpansion) por codigo.

    Por defecto se usa el grupo mas antiguo (edicion base). PERO: Cardmarket
    cataloga cada idioma como una expansion distinta (p.ej. "Memorial
    Collection EB01" vs "Memorial Collection (Non-English) EB01-JP"), y no
    hay forma de saber cual es cual por nombre -- el feed bulk no trae ni
    idioma ni nombre de expansion. Se observo en vivo (carta Cavendish
    EB01-012, ver AGENTS.md) que la ficha japonesa se cataloga ANTES que la
    inglesa, así que "coger la mas antigua a secas" elegia sistematicamente
    el mercado equivocado (precios mucho mas bajos que el ingles real).

    Mitigacion (heuristica, no una solucion perfecta -- ver AGENTS.md para
    la alternativa descartada de mapear nombres de expansion a mano): si las
    DOS primeras ediciones cronologicas de un codigo tienen el MISMO numero
    de productos (mismo patron Normal+Parallel = probable pareja de idiomas
    de la misma edicion), se hace el swap a la 2a edicion SOLO si se cumplen
    dos condiciones a la vez:

      1. Consistencia: CADA producto de la 2a edicion vale igual o mas que su
         correspondiente en la 1a (mismo orden por idProduct), y al menos uno
         vale estrictamente mas. Si un par sube y el otro baja, no es una
         pareja de idiomas -- son dos productos no relacionados que
         casualmente coinciden en tamano de grupo (visto en vivo: ST03-013,
         donde el "swap" metia una reimpresion rara de 1500€ en vez del
         parallel normal de 20€ mientras el otro par SI bajaba).
      2. Tope: ningun precio de la 2a edicion supera MAX_SWAP_PRICE. Sin esto,
         una promo ultra-rara que por casualidad tenga el mismo tamano de
         grupo (Special Tournament Promos a 4500-6000€, o P-031 disparando a
         50000€) se cuela como si fuera la version inglesa normal.

    Si los tamanos difieren, o no se cumplen las dos condiciones, se mantiene
    el comportamiento por defecto: usar solo la edicion mas antigua.

    Se limita a comparar SOLO las dos primeras ediciones (nunca la 3a en
    adelante) por la misma razon que el tope: cuantas mas ediciones se
    consideren, mas facil colar un producto no relacionado.

    Devuelve { idProduct: (code, suffix) }.
    """
    # code -> idExpansion -> [product, ...]
    groups = defaultdict(lambda: defaultdict(list))
    for p in products:
        m = CODE_RE.search(p.get("name") or "")
        if not m:
            continue
        code = m.group(1)
        if code not in variants_by_code:
            continue
        groups[code][p["idExpansion"]].append(p)

    mapping = {}
    for code, by_expansion in groups.items():
        expansions_by_date = sorted(by_expansion, key=lambda exp: min(p["dateAdded"] for p in by_expansion[exp]))
        base_expansion = expansions_by_date[0]

        if len(expansions_by_date) > 1:
            second_expansion = expansions_by_date[1]
            first_group, second_group = by_expansion[base_expansion], by_expansion[second_expansion]
            if len(first_group) == len(second_group):
                p1 = _ordered_prices(first_group, price_by_id)
                p2 = _ordered_prices(second_group, price_by_id)
                consistent = all(b >= a for a, b in zip(p1, p2)) and any(b > a for a, b in zip(p1, p2))
                within_cap = all(v <= MAX_SWAP_PRICE for v in p2)
                if consistent and within_cap:
                    base_expansion = second_expansion

        base_group = sorted(by_expansion[base_expansion], key=lambda p: p["idProduct"])

        suffixes = variants_by_code[code]
        for product, suffix in zip(base_group, suffixes):
            mapping[product["idProduct"]] = (code, suffix)
        # Sobrante de base_group (mas productos que variantes conocidas) se descarta.

    return mapping


def build_prices(mapping, price_guide, existing):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prices = dict(existing)  # conserva product_url ya conocido de scrapes anteriores
    matched, priced = 0, 0

    for entry in price_guide:
        id_product = entry.get("idProduct")
        target = mapping.get(id_product)
        if not target:
            continue
        code, suffix = target
        key = f"{code}{suffix}"
        matched += 1

        low   = entry.get("low")
        trend = entry.get("trend")
        if low is None and trend is None:
            continue
        priced += 1

        prev = prices.get(key, {})
        prices[key] = {
            **prev,
            "low":     low,
            "trend":   trend,
            "updated": today,
        }

    return prices, matched, priced


def save_prices(prices):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source":    "cardmarket.com/en/OnePiece (bulk price guide, idGame=18)",
        "currency":  "EUR",
        "fetched":   len(prices),
        "prices":    prices,
    }
    with open(PRICES_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[OK] Guardado {PRICES_PATH} ({len(prices)} entradas)")

    if APP_PRICES.parent.exists():
        shutil.copy2(PRICES_PATH, APP_PRICES)
        print(f"[OK] Copiado a {APP_PRICES}")
    else:
        print(f"[!] {APP_PRICES.parent} no existe -- copia manual.")


def main():
    parser = argparse.ArgumentParser(description="Precios de Cardmarket via su feed publico (sin scraping).")
    parser.add_argument("--dry-run", action="store_true", help="Descargar y emparejar, pero no escribir prices.json.")
    args = parser.parse_args()

    print("=" * 60)
    print(" Cardmarket bulk price feed . One Piece TCG (idGame=18)")
    print("=" * 60)

    variants_by_code = load_index_variants()
    print(f"[*] Indice: {len(variants_by_code)} codigos")

    print(f"[*] Descargando catalogo de productos...")
    products = fetch_json(PRODUCTS_URL)["products"]
    print(f"    {len(products)} productos")

    print(f"[*] Descargando guia de precios...")
    price_data = fetch_json(PRICES_URL)
    price_guide = price_data["priceGuides"]
    print(f"    {len(price_guide)} entradas de precio (generado {price_data.get('createdAt')})")

    price_by_id = {entry["idProduct"]: entry for entry in price_guide}
    mapping = match_products_to_variants(products, variants_by_code, price_by_id)
    print(f"[*] {len(mapping)} idProduct emparejados con una variante conocida")

    existing = load_existing_prices()
    prices, matched, priced = build_prices(mapping, price_guide, existing)

    print(f"[*] {matched} entradas de precio emparejadas, {priced} con low/trend real")
    print(f"[*] Total en prices.json (incluye entradas previas conservadas): {len(prices)}")

    if args.dry_run:
        print("\n[DRY RUN] No se ha escrito nada.")
        return

    save_prices(prices)
    print("\n[DONE]")


if __name__ == "__main__":
    main()
