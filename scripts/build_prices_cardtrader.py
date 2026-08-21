#!/usr/bin/env python3
"""
build_prices_cardtrader.py
---------------------------
Precios de CardTrader para OPTCG, via su API oficial (reemplaza al feed
bulk de Cardmarket de build_prices_bulk.py -- ver AGENTS.md para el porque).

CardTrader SI expone el codigo impreso de la carta directamente en cada
listado del marketplace (`properties_hash.collector_number`, p.ej.
"OP01-001" o "OP01-001a" para el parallel) -- a diferencia del feed de
Cardmarket, que solo trae el nombre del producto y hay que adivinar el
emparejamiento por posicion/orden de alta. Eso simplifica mucho el
matching: no hace falta pasar por card_market_ids ni por heuristicas de
fecha/precio para separar idiomas.

ENDPOINTS USADOS (ver https://www.cardtrader.com/es/docs/api/full/reference):
  GET /games                         -> confirmar game_id de One Piece (15)
  GET /expansions                    -> listar expansiones (id, code, game_id)
  GET /marketplace/products?expansion_id=X&language=en
      -> TODOS los blueprints de esa expansion de una vez (los 25 listados
         mas baratos de cada uno). No hay endpoint de export masivo por
         juego -- hay que iterar por expansion_id (~90 llamadas para One
         Piece, muy por debajo del limite de 10 req/s).

AUTENTICACION: Bearer token personal (cuenta gratuita CardTrader). Se lee de
la variable de entorno CARDTRADER_API_TOKEN (o de un .env en la raiz del
repo, NUNCA committeado -- ver .gitignore). Los precios vienen ya en la
divisa configurada en la cuenta CardTrader del token: para que esto sirva
como referencia EUR, esa cuenta debe tener EUR como divisa (Perfil ->
Configuracion en cardtrader.com). El endpoint no admite parametro de
conversion de divisa.

MATCHING code -> variante:
  1. Se normaliza el `code` de expansion de CardTrader (p.ej. "eb-01") y el
     `set_source` de nuestras variantes (p.ej. "EB01") al mismo formato
     (minusculas, sin guiones) para emparejar expansion CardTrader <->
     nuestro set.
  2. `collector_number` de cada listado = nuestro `code` + opcionalmente una
     letra de sufijo ("a", "b"...) para parallels/alt-arts DENTRO de esa
     misma expansion.
  3. Igual que build_prices_bulk.py: se empareja por POSICION, en el mismo
     orden que las variantes de nuestro indice (excluyendo el sufijo "" que
     siempre es la Normal) -- '' -> Normal, 'a' -> variants[1], 'b' ->
     variants[2], etc. Esto asume que el orden alfabetico de CardTrader
     coincide con el orden de nuestro indice; no hay garantia formal, pero
     es la misma asuncion (y el mismo riesgo residual) que ya asumia el
     script de Cardmarket para reimpresiones ambiguas. Reimpresiones en OTRA
     expansion (p.ej. una carta base reeditada en un Premium Card Collection
     con su propio parallel) no se resuelven aqui: esa expansion tiene su
     propio expansion_id en CardTrader y, si no coincide con el set_source de
     ninguna variante nuestra, sus listados simplemente no producen match
     (se descartan, no se fuerza una asignacion).
  4. Precios promo (set_source "P") no se intentan: CardTrader reparte los
     promos en 7+ expansiones distintas (up, promo, jp, stp, oppr, bandai,
     jp-promo...) sin forma fiable de saber cual mapea a que codigo P-XXX
     nuestro. Se quedan en el fallback por rareza, igual que hoy.

AGREGACION DE PRECIO (el marketplace da listados individuales, no un indice
agregado como el trend de Cardmarket):
  low   = precio del listado mas barato (EUR)
  trend = media de los hasta 3 listados mas baratos (mas estable que el
          minimo puro contra un vendedor con precio erroneo/outlier)

USO:
    python scripts/build_prices_cardtrader.py            # dry-run implicito la 1a vez -- ver --write
    python scripts/build_prices_cardtrader.py --write     # escribe data/prices.json
    python scripts/build_prices_cardtrader.py --write --limit 5   # solo 5 expansiones, para probar rapido
"""

import argparse
import json
import os
import re
import shutil
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

API_BASE = "https://api.cardtrader.com/api/v2"
GAME_NAME = "One Piece"  # se resuelve a game_id via /games, no se hardcodea el id

ROOT        = Path(__file__).resolve().parent.parent
DATA_DIR    = ROOT / "data"
INDEX_PATH  = DATA_DIR / "index.json"
PRICES_PATH = DATA_DIR / "prices.json"
APP_PRICES  = ROOT / "app" / "src" / "data" / "prices.json"
ENV_PATH    = ROOT / ".env"

HTTP_TIMEOUT = 30
REQUEST_GAP  = 0.15  # segundos entre llamadas -- ~6.5 req/s, margen bajo el limite de 10 req/s

# "OP01-001" o "OP01-001a" -> ("OP01-001", "a" o "")
COLLECTOR_RE = re.compile(r"^([A-Z0-9]+-\d+)([a-z]?)$")


def load_dotenv(path: Path) -> None:
    """Carga variables de un .env simple (KEY=VALUE por linea) sin depender
    de python-dotenv. No sobreescribe variables ya presentes en el entorno."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def get_token() -> str:
    load_dotenv(ENV_PATH)
    token = os.environ.get("CARDTRADER_API_TOKEN")
    if not token:
        print("[!] Falta CARDTRADER_API_TOKEN.")
        print("    Crea una cuenta gratuita en cardtrader.com, genera un token personal")
        print("    (Perfil -> API) y ponlo en un fichero .env en la raiz del repo:")
        print("    CARDTRADER_API_TOKEN=...")
        print("    IMPORTANTE: pon la divisa de la cuenta en EUR (Perfil -> Configuracion)")
        print("    para que los precios que devuelve la API sean EUR, no USD.")
        sys.exit(1)
    return token


def api_get(session: requests.Session, path: str, **params):
    time.sleep(REQUEST_GAP)
    resp = session.get(f"{API_BASE}{path}", params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def normalize_expansion_code(code: str) -> str:
    return re.sub(r"[^a-z0-9]", "", code.lower())


def load_index_variants():
    """code -> [suffix, ...] (base "" primero, orden del indice) + code -> set_source."""
    if not INDEX_PATH.exists():
        print(f"[!] No existe {INDEX_PATH}. Ejecuta primero build_card_database.py.")
        sys.exit(1)
    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        cards = json.load(f).get("cards", {})
    variants_by_code = {}
    set_source_by_code = {}
    for code, card in cards.items():
        variants = card.get("variants", [])
        variants_by_code[code] = [v["suffix"] for v in variants]
        # set_source es el mismo para todas las variantes de un code en la
        # inmensa mayoria de casos (ver docstring) -- se usa el de la Normal.
        set_source_by_code[code] = (variants[0].get("set_source") if variants else None) or ""
    return variants_by_code, set_source_by_code


def load_existing_prices():
    if not PRICES_PATH.exists():
        return {}
    with open(PRICES_PATH, "r", encoding="utf-8") as f:
        return json.load(f).get("prices", {})


def resolve_game_id(session: requests.Session) -> int:
    games = api_get(session, "/games")
    for g in games.get("array", games if isinstance(games, list) else []):
        if g.get("name", "").strip().lower() == GAME_NAME.lower():
            return g["id"]
    print(f"[!] No se encontro el juego '{GAME_NAME}' en /games.")
    sys.exit(1)


def relevant_expansions(session: requests.Session, game_id: int, set_sources: set):
    """Expansiones de CardTrader cuyo `code` normalizado coincide con algun
    set_source de nuestro indice. Devuelve [(expansion_id, code, set_source), ...]."""
    all_expansions = api_get(session, "/expansions")
    by_norm = {}
    for exp in all_expansions:
        if exp.get("game_id") != game_id:
            continue
        by_norm.setdefault(normalize_expansion_code(exp["code"]), []).append(exp)

    normalized_sources = {normalize_expansion_code(s): s for s in set_sources if s}

    matches = []
    for norm_code, exps in by_norm.items():
        if norm_code not in normalized_sources:
            continue
        if len(exps) > 1:
            print(f"[!] Codigo de expansion '{norm_code}' ambiguo en CardTrader "
                  f"({[e['code'] for e in exps]}) -- se usa el primero.")
        matches.append((exps[0]["id"], exps[0]["code"], normalized_sources[norm_code]))
    return matches


def match_listings_to_variants(listings_by_blueprint, variants_by_code, expected_set_source):
    """
    { (code, suffix): [precio_eur, ...] } a partir de los listados de UNA
    expansion de CardTrader, casando por collector_number (ver docstring del
    modulo). `expected_set_source` es el set_source de nuestro indice que
    corresponde a esta expansion -- solo se aceptan matches de codigos cuyo
    set_source coincide (evita que un listado de una expansion equivocada, si
    la normalizacion de codigo colisionara, contamine otro set).
    """
    prices_by_key = defaultdict(list)
    for listings in listings_by_blueprint.values():
        for listing in listings:
            props = listing.get("properties_hash") or {}
            collector = props.get("collector_number")
            if not collector:
                continue  # producto sellado u otro tipo sin numero de coleccion

            # El parametro `language=en` de la query NO filtra nada en la
            # practica (verificado en vivo: expansion_id=3728 devolvio
            # copias japonesas mezcladas, una de ellas a 10000€ como outlier)
            # -- hay que filtrar en cliente por onepiece_language. Igual con
            # condition: los precios de Cardmarket con los que se compara son
            # de cartas Near Mint (ver app/src/lib/prices.ts), así que se
            # descartan Played/Damaged para no sesgar el precio a la baja.
            if props.get("onepiece_language") != "en":
                continue
            if props.get("condition") != "Near Mint":
                continue

            m = COLLECTOR_RE.match(collector)
            if not m:
                continue
            code, letter = m.group(1), m.group(2)

            suffixes = variants_by_code.get(code)
            if suffixes is None:
                continue  # carta que no tenemos en el indice

            if letter == "":
                suffix = suffixes[0] if suffixes and suffixes[0] == "" else None
            else:
                idx = ord(letter) - ord("a") + 1  # 'a' -> indice 1 (primera tras la Normal)
                suffix = suffixes[idx] if idx < len(suffixes) else None
            if suffix is None:
                continue

            price = listing.get("price") or {}
            cents, currency = price.get("cents"), price.get("currency")
            if cents is None or currency != "EUR":
                continue  # cuenta no configurada en EUR, o listado en otra divisa

            prices_by_key[(code, suffix)].append(cents / 100)

    return prices_by_key


def build_prices(all_prices_by_key, existing):
    """Misma politica que build_prices_bulk.py: se reconstruye low/trend/updated
    desde cero cada corrida; solo se conserva product_url de `existing`."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prices = {}
    matched, priced = 0, 0

    target_keys = {f"{code}{suffix}": vals for (code, suffix), vals in all_prices_by_key.items()}

    for key in set(existing) | set(target_keys):
        entry = {}
        product_url = existing.get(key, {}).get("product_url")
        if product_url:
            entry["product_url"] = product_url

        vals = target_keys.get(key)
        if vals:
            matched += 1
            vals_sorted = sorted(vals)
            low = vals_sorted[0]
            trend = sum(vals_sorted[:3]) / min(3, len(vals_sorted))
            priced += 1
            entry["low"] = round(low, 2)
            entry["trend"] = round(trend, 2)
            entry["updated"] = today

        if entry:
            prices[key] = entry

    return prices, matched, priced


def save_prices(prices):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source":    "cardtrader.com API (marketplace/products por expansion, language=en)",
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
    parser = argparse.ArgumentParser(description="Precios de CardTrader via su API oficial.")
    parser.add_argument("--write", action="store_true", help="Escribe data/prices.json. Sin esto, solo informa (dry-run).")
    parser.add_argument("--limit", type=int, default=None, help="Solo procesa las N primeras expansiones relevantes (debug).")
    args = parser.parse_args()

    print("=" * 60)
    print(" CardTrader API . One Piece TCG")
    print("=" * 60)

    token = get_token()
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {token}"

    variants_by_code, set_source_by_code = load_index_variants()
    print(f"[*] Indice: {len(variants_by_code)} codigos")

    game_id = resolve_game_id(session)
    print(f"[*] game_id de One Piece: {game_id}")

    set_sources = set(set_source_by_code.values())
    expansions = relevant_expansions(session, game_id, set_sources)
    if args.limit:
        expansions = expansions[: args.limit]
    print(f"[*] {len(expansions)} expansiones de CardTrader casan con nuestro indice "
          f"(de {len(set_sources)} set_source distintos)")

    all_prices_by_key = defaultdict(list)
    for i, (expansion_id, ct_code, set_source) in enumerate(expansions, 1):
        print(f"    [{i}/{len(expansions)}] {ct_code} (expansion_id={expansion_id})...", end=" ")
        try:
            listings_by_blueprint = api_get(
                session, "/marketplace/products", expansion_id=expansion_id, language="en"
            )
        except requests.HTTPError as e:
            print(f"ERROR ({e})")
            continue
        matches = match_listings_to_variants(listings_by_blueprint, variants_by_code, set_source)
        for k, v in matches.items():
            all_prices_by_key[k].extend(v)
        print(f"{len(listings_by_blueprint)} blueprints, {len(matches)} variantes emparejadas")

    existing = load_existing_prices()
    prices, matched, priced = build_prices(all_prices_by_key, existing)

    print(f"\n[*] {matched} variantes con precio real de CardTrader")
    print(f"[*] Total en prices.json (incluye entradas previas conservadas): {len(prices)}")

    if not args.write:
        print("\n[DRY RUN] No se ha escrito nada. Repite con --write para guardar.")
        return

    save_prices(prices)
    print("\n[DONE]")


if __name__ == "__main__":
    main()
