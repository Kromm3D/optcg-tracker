// Comprueba si hay precios más nuevos en el CDN (jsDelivr, mismo repo que
// data/index.json — ver lib/remoteIndex.ts) y los aplica en caliente.
//
// A diferencia de remoteIndex.ts, que exige que el usuario confirme el
// refresco (trae sets/cartas/imágenes nuevas, coste real de descarga y
// almacenamiento), un refresco de precios es solo reemplazar unos números:
// se aplica solo, en segundo plano, sin pedir permiso ni mostrar banner.
//
// Fallo silencioso en cualquier punto (offline, CDN caído, JSON inválido,
// menos entradas de las esperadas): el prices.json bundleado — o el último
// que se cacheó con éxito — sigue sirviendo sin que el usuario vea error.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATA_BASE_URL } from '../config';
import { applyPricesPayload, PRICES_META, type PricesPayload } from './prices';

const STORAGE_KEY = 'optcg.remotePrices.v1';

// Mismo umbral defensivo que usa el paso "verify" del workflow de CI: si el
// feed de Cardmarket devuelve un prices.json roto o vacío, no lo aplicamos.
const MIN_ENTRIES = 500;

let checked = false;

function isUsable(payload: unknown): payload is PricesPayload {
  const p = payload as PricesPayload;
  return (
    !!p &&
    typeof p.generated === 'string' &&
    !!p.prices &&
    typeof p.prices === 'object' &&
    Object.keys(p.prices).length >= MIN_ENTRIES
  );
}

function isNewer(payload: PricesPayload): boolean {
  return payload.generated > PRICES_META.generated;
}

async function readCached(): Promise<PricesPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isUsable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Aplica el último precio cacheado (si es más nuevo que el bundleado) y
 * lanza la comprobación de red en segundo plano. Pensado para llamarse una
 * vez al arrancar la app (ver App.tsx, junto a remoteIndex.checkForUpdate).
 * Nunca lanza.
 *
 * Nota para quien consuma `PRICES_META`/`getPrice()` tras esta llamada: como
 * es fire-and-forget, cualquier cambio de precio se aplica de forma
 * asíncrona en un momento indeterminado. Quien necesite reaccionar a ESE
 * cambio (no sólo leer el precio ya actualizado) debe suscribirse con
 * `subscribeToPrices()` (ver prices.ts) en vez de asumir un orden de
 * ejecución con esta función — ver priceHistory.ts.
 */
export async function checkForPriceUpdate(): Promise<void> {
  if (checked) return; // una comprobación por sesión de app basta
  checked = true;

  const cached = await readCached();
  if (cached && isNewer(cached)) {
    applyPricesPayload(cached);
  }

  try {
    const res = await fetch(`${DATA_BASE_URL}/prices.json`);
    if (!res.ok) return;
    const payload: unknown = await res.json();
    if (!isUsable(payload) || !isNewer(payload)) return;

    applyPricesPayload(payload);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Offline, CDN caído, JSON inválido... silencioso por diseño (ver brief).
  }
}
