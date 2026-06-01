// Trade binder. The tradeable quantity for a card is normally derived:
//   max(0, ownedCopies - playsetSize)
// i.e. anything beyond your playset overflows here automatically. Users can
// override that per card (mark fewer/more copies as available for trade).
// Only the overrides are persisted; the derived amount is computed at read.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOwnedFor } from './ownedAggregate';
import { getSettings } from './settings';

const STORAGE_KEY = 'optcg.trade.v1';

/** Per-card manual override of tradeable copies (code → qty). */
type OverrideMap = Record<string, number>;

let cache: OverrideMap | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<OverrideMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as OverrideMap) : {};
  } catch (e) {
    console.warn('[trade] error leyendo storage:', e);
    cache = {};
  }
  return cache;
}

async function write(map: OverrideMap): Promise<void> {
  cache = map;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[trade] error escribiendo storage:', e);
  }
  listeners.forEach((l) => l());
}

/** Default tradeable amount from the playset overflow rule. */
export function defaultTradeQty(code: string): number {
  return Math.max(0, getOwnedFor(code) - getSettings().playsetSize);
}

/** Tradeable copies of a card: manual override if set, else playset overflow. */
export function getTradeQty(code: string): number {
  const override = cache?.[code];
  return override !== undefined ? override : defaultTradeQty(code);
}

/** Set a manual override; pass null to clear it and fall back to the default. */
export async function setTradeOverride(code: string, qty: number | null): Promise<void> {
  const map = { ...(await read()) };
  if (qty === null) delete map[code];
  else map[code] = Math.max(0, Math.floor(qty));
  await write(map);
}

export function getOverrides(): OverrideMap {
  return cache ?? {};
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Hidratacion inicial
read();
