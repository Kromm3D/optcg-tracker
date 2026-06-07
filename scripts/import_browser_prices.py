#!/usr/bin/env python3
"""
import_browser_prices.py
------------------------
Importa un fichero browser_dump.json generado por scrape_browser_console.js
y lo fusiona con data/prices.json (crea uno nuevo si no existe).

USO:
    python scripts/import_browser_prices.py                        # fusiona data/browser_dump.json
    python scripts/import_browser_prices.py ruta/a/dump.json       # usa otro fichero
"""

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT       = Path(__file__).resolve().parent.parent
DATA_DIR   = ROOT / "data"
PRICES_OUT = DATA_DIR / "prices.json"
APP_PRICES = ROOT / "app" / "src" / "data" / "prices.json"

dump_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DATA_DIR / "browser_dump.json"

if not dump_path.exists():
    print(f"[!] No se encontró: {dump_path}")
    print("    Copia browser_dump.json a data/ o pasa la ruta como argumento.")
    sys.exit(1)

with open(dump_path, encoding="utf-8") as f:
    dump = json.load(f)

new_prices  = dump.get("prices", {})
source_info = dump.get("source", "browser console")

# Cargar precios existentes (si hay)
existing = {}
if PRICES_OUT.exists():
    with open(PRICES_OUT, encoding="utf-8") as f:
        existing = json.load(f).get("prices", {})

before = len(existing)
existing.update(new_prices)
after  = len(existing)

payload = {
    "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "source":    source_info,
    "currency":  dump.get("currency", "EUR"),
    "fetched":   after,
    "prices":    existing,
}

DATA_DIR.mkdir(parents=True, exist_ok=True)
with open(PRICES_OUT, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print(f"[OK] prices.json actualizado: {before} → {after} entradas (+{after-before} nuevas)")

if APP_PRICES.parent.exists():
    shutil.copy2(PRICES_OUT, APP_PRICES)
    print(f"[OK] Copiado a {APP_PRICES}")
else:
    print(f"[!] {APP_PRICES.parent} no existe — copia manual.")
