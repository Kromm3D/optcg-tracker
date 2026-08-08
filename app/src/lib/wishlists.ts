// wishlists.ts — multi-wishlist management.
// Stored as optcg.wishlists.v4 in AsyncStorage.
// Each wishlist has a name, creation date, and a flat map of
// card+variant entries (code+suffix → WishlistCard).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Wishlist, WishlistCard } from '../types';
import { notifyLocalChange } from './syncBus';

const STORAGE_KEY = 'optcg.wishlists.v4';
/** v3 = igual shape que v4, pero sin lápidas (borrar era borrar de verdad). */
const LEGACY_KEY_V3 = 'optcg.wishlists.v3';
const LEGACY_KEY = 'optcg.wishlists.v2';
/** Wishlist única pre-multi-wishlist (eliminada 2026-06-06). Ver B-06. */
const ANCIENT_SINGLE_KEY = 'optcg.wishlist.v1';

/** Cuánto se conserva la lápida de una wishlist borrada. Ver B-17 / mismo
 *  razonamiento que lib/collection.ts y lib/decks.ts. */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type WishlistMap = Record<string, Wishlist>;

/** ¿Es una lápida (wishlist borrada) en vez de una wishlist real? */
function isTombstone(wl: Wishlist): boolean {
  return wl.deleted === true;
}

function liveOnly(map: WishlistMap): WishlistMap {
  const out: WishlistMap = {};
  for (const k of Object.keys(map)) if (!isTombstone(map[k])) out[k] = map[k];
  return out;
}

/** Descarta las lápidas ya caducadas (ver TOMBSTONE_TTL_MS). */
function pruneTombstones(map: WishlistMap): WishlistMap {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const out: WishlistMap = {};
  for (const k of Object.keys(map)) {
    const wl = map[k];
    if (isTombstone(wl) && (wl.updatedAt ?? 0) < cutoff) continue;
    out[k] = wl;
  }
  return out;
}

/** Forma del `WishlistItem` antiguo, keyed por código base sin variantes. */
interface LegacyWishlistItem {
  code?: string;
  qty?: number;
  needed?: number;
  addedAt?: number;
}

/** Caché completa **incluyendo lápidas**: persistida y consumida por la sync. */
let cache: WishlistMap | null = null;
/** Vista sin lápidas, recalculada en cada escritura. */
let live: WishlistMap = {};
const listeners = new Set<() => void>();

/** B-06 — convierte la wishlist única antigua en una wishlist con nombre.
 *  El formato viejo estaba keyed por código base y no tenía variantes, así
 *  que todas las entradas migran a la variante base (suffix ""). */
function migrateAncientSingle(raw: string): WishlistMap | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const entries: LegacyWishlistItem[] = Array.isArray(parsed)
    ? (parsed as LegacyWishlistItem[])
    : parsed && typeof parsed === 'object'
      ? Object.entries(parsed as Record<string, LegacyWishlistItem | number>).map(([code, v]) =>
          typeof v === 'number' ? { code, qty: v } : { code, ...v },
        )
      : [];

  const cards: Record<string, WishlistCard> = {};
  for (const it of entries) {
    const code = it.code;
    if (!code || typeof code !== 'string') continue;
    cards[wishCardKey(code, '')] = {
      code,
      suffix: '',
      needed: Math.max(1, it.needed ?? it.qty ?? 1),
      addedAt: it.addedAt ?? 0,
    };
  }
  if (Object.keys(cards).length === 0) return null;

  const wl: Wishlist = {
    id: 'wl_migrated_v1',
    name: 'Wishlist',
    cards,
    createdAt: 0,
    updatedAt: 0,
  };
  return { [wl.id]: wl };
}

// Migración v2 → v3: añade `updatedAt` (sellado a 0 = legacy) para la sync.
// Migración v3 → v4: añade lápidas — un registro v3 no tiene ninguna, se lee
// tal cual. Se bumpea la clave para que una app v3 no interprete una lápida
// como una wishlist de verdad.
async function loadRaw(): Promise<WishlistMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) return pruneTombstones(JSON.parse(raw) as WishlistMap);
  const legacy = (await AsyncStorage.getItem(LEGACY_KEY_V3)) ?? (await AsyncStorage.getItem(LEGACY_KEY));
  if (legacy) {
    const map = JSON.parse(legacy) as WishlistMap;
    for (const k of Object.keys(map)) if (map[k].updatedAt == null) map[k].updatedAt = 0;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return map;
  }
  // B-06: último recurso, la wishlist única pre-multi-wishlist.
  const ancient = await AsyncStorage.getItem(ANCIENT_SINGLE_KEY);
  if (ancient) {
    const map = migrateAncientSingle(ancient);
    if (map) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      // No borramos la clave vieja: si la migración resultó mal, el dato
      // original sigue ahí para recuperarlo a mano.
      return map;
    }
  }
  return {};
}

async function read(): Promise<WishlistMap> {
  if (cache) return cache;
  try {
    cache = await loadRaw();
    live = liveOnly(cache);
  } catch (e) {
    console.warn('[wishlists] read error:', e);
    cache = {};
    live = {};
  }
  return cache;
}

/** Marca de tiempo del último cambio de una wishlist (mutador interno). */
function touch(wl: Wishlist): Wishlist {
  return { ...wl, updatedAt: Date.now() };
}

async function write(map: WishlistMap, emit = true): Promise<void> {
  cache = map;
  live = liveOnly(map);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[wishlists] write error:', e);
  }
  listeners.forEach((l) => l());
  if (emit) notifyLocalChange('wishlists');
}

/** Reemplaza todas las wishlists (usado por la sync, incluye lápidas). No re-emite al bus. */
export async function replaceAllFromSync(wishlists: Wishlist[]): Promise<void> {
  const map: WishlistMap = {};
  for (const wl of wishlists) map[wl.id] = wl;
  await write(map, false);
}

/**
 * Caché **incluyendo lápidas**. Sólo para lib/sync.ts: el reconcile necesita
 * ver los borrados para no dejar que el servidor los resucite (B-17).
 */
export function getCacheWithTombstones(): WishlistMap {
  return cache ?? {};
}

/** Key used for entries inside a wishlist's `cards` map. */
export function wishCardKey(code: string, suffix: string): string {
  return `${code}${suffix}`;
}

// ─── Wishlist CRUD ─────────────────────────────────────────────────────────

export async function listWishlists(): Promise<Wishlist[]> {
  await read();
  return Object.values(live).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getWishlist(id: string): Promise<Wishlist | null> {
  const map = await read();
  const wl = map[id];
  return wl && !isTombstone(wl) ? wl : null;
}

export async function createWishlist(name: string): Promise<Wishlist> {
  const map = { ...(await read()) };
  const now = Date.now();
  const wl: Wishlist = {
    id: `wl_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Wishlist',
    cards: {},
    createdAt: now,
    updatedAt: now,
  };
  map[wl.id] = wl;
  await write(map);
  return wl;
}

export async function renameWishlist(id: string, name: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id] || isTombstone(map[id])) return;
  map[id] = touch({ ...map[id], name: name.trim() });
  await write(map);
}

/** Borra una wishlist localmente. Deja una lápida (B-17) en vez de borrar de
 *  verdad, para que la sync no la resucite al ver la fila del servidor. */
export async function deleteWishlist(id: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id]) return;
  map[id] = {
    id,
    name: '',
    cards: {},
    createdAt: map[id].createdAt,
    updatedAt: Date.now(),
    deleted: true,
  };
  await write(map);
}

/** Remove all cards from a wishlist (keep the wishlist itself). */
export async function wipeWishlist(id: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id] || isTombstone(map[id])) return;
  map[id] = touch({ ...map[id], cards: {} });
  await write(map);
}

// ─── Card operations ───────────────────────────────────────────────────────

/** Add or update a card+variant entry. Default suffix "" = base/non-parallel. */
export async function addCard(
  wishlistId: string,
  code: string,
  suffix: string,
  needed: number,
): Promise<void> {
  const map = { ...(await read()) };
  if (!map[wishlistId] || isTombstone(map[wishlistId])) return;
  const key = wishCardKey(code, suffix);
  const existing = map[wishlistId].cards[key];
  map[wishlistId] = touch({
    ...map[wishlistId],
    cards: {
      ...map[wishlistId].cards,
      [key]: {
        code,
        suffix,
        needed: Math.max(1, needed),
        addedAt: existing?.addedAt ?? Date.now(),
      },
    },
  });
  await write(map);
}

export async function removeCard(wishlistId: string, code: string, suffix: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[wishlistId]) return;
  const cards = { ...map[wishlistId].cards };
  delete cards[wishCardKey(code, suffix)];
  map[wishlistId] = touch({ ...map[wishlistId], cards });
  await write(map);
}

/** Change the needed count by delta; removes the entry if it drops to ≤ 0. */
export async function adjustNeeded(
  wishlistId: string,
  code: string,
  suffix: string,
  delta: number,
): Promise<void> {
  const map = { ...(await read()) };
  if (!map[wishlistId]) return;
  const key = wishCardKey(code, suffix);
  const current = map[wishlistId].cards[key]?.needed ?? 0;
  const next = current + delta;
  if (next <= 0) {
    const cards = { ...map[wishlistId].cards };
    delete cards[key];
    map[wishlistId] = touch({ ...map[wishlistId], cards });
  } else {
    map[wishlistId] = touch({
      ...map[wishlistId],
      cards: {
        ...map[wishlistId].cards,
        [key]: { ...(map[wishlistId].cards[key] ?? { code, suffix, addedAt: Date.now() }), needed: next },
      },
    });
  }
  await write(map);
}

/** Set needed to an explicit value; removes the entry if ≤ 0. */
export async function setNeeded(
  wishlistId: string,
  code: string,
  suffix: string,
  needed: number,
): Promise<void> {
  if (needed <= 0) {
    await removeCard(wishlistId, code, suffix);
    return;
  }
  await addCard(wishlistId, code, suffix, needed);
}

// ─── Query helpers ─────────────────────────────────────────────────────────

/** Is this base card code present in any wishlist (any variant)? Sync from cache. */
export function isInAnyWishlistSync(code: string): boolean {
  if (!cache) return false;
  for (const wl of Object.values(cache)) {
    for (const key of Object.keys(wl.cards)) {
      if (key === code || key.startsWith(`${code}_`)) return true;
    }
  }
  return false;
}

export async function isInAnyWishlist(code: string): Promise<boolean> {
  await read(); // ensure cache is populated
  return isInAnyWishlistSync(code);
}

/** Return all WishlistCard entries (across all wishlists) for a given card code. */
export function getEntriesForCard(code: string): Array<{ wishlistId: string; entry: WishlistCard }> {
  if (!cache) return [];
  const result: Array<{ wishlistId: string; entry: WishlistCard }> = [];
  for (const wl of Object.values(cache)) {
    for (const [key, entry] of Object.entries(wl.cards)) {
      if (entry.code === code) result.push({ wishlistId: wl.id, entry });
    }
  }
  return result;
}

/** getCachedWishlists — synchronous read from cache for renders. */
export function getCachedWishlists(): Wishlist[] {
  if (!cache) return [];
  return Object.values(live).sort((a, b) => a.createdAt - b.createdAt);
}

// ─── Pub/sub ───────────────────────────────────────────────────────────────

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Initial hydration
read();
