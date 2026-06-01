// wishlists.ts — multi-wishlist management.
// Stored as optcg.wishlists.v2 in AsyncStorage.
// Each wishlist has a name, creation date, and a flat map of
// card+variant entries (code+suffix → WishlistCard).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Wishlist, WishlistCard } from '../types';

const STORAGE_KEY = 'optcg.wishlists.v2';

type WishlistMap = Record<string, Wishlist>;

let cache: WishlistMap | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<WishlistMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as WishlistMap) : {};
  } catch (e) {
    console.warn('[wishlists] read error:', e);
    cache = {};
  }
  return cache;
}

async function write(map: WishlistMap): Promise<void> {
  cache = map;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[wishlists] write error:', e);
  }
  listeners.forEach((l) => l());
}

/** Key used for entries inside a wishlist's `cards` map. */
export function wishCardKey(code: string, suffix: string): string {
  return `${code}${suffix}`;
}

// ─── Wishlist CRUD ─────────────────────────────────────────────────────────

export async function listWishlists(): Promise<Wishlist[]> {
  const map = await read();
  return Object.values(map).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getWishlist(id: string): Promise<Wishlist | null> {
  const map = await read();
  return map[id] ?? null;
}

export async function createWishlist(name: string): Promise<Wishlist> {
  const map = { ...(await read()) };
  const wl: Wishlist = {
    id: `wl_${Date.now()}`,
    name: name.trim() || 'Wishlist',
    cards: {},
    createdAt: Date.now(),
  };
  map[wl.id] = wl;
  await write(map);
  return wl;
}

export async function renameWishlist(id: string, name: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id]) return;
  map[id] = { ...map[id], name: name.trim() };
  await write(map);
}

export async function deleteWishlist(id: string): Promise<void> {
  const map = { ...(await read()) };
  delete map[id];
  await write(map);
}

/** Remove all cards from a wishlist (keep the wishlist itself). */
export async function wipeWishlist(id: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id]) return;
  map[id] = { ...map[id], cards: {} };
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
  if (!map[wishlistId]) return;
  const key = wishCardKey(code, suffix);
  const existing = map[wishlistId].cards[key];
  map[wishlistId] = {
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
  };
  await write(map);
}

export async function removeCard(wishlistId: string, code: string, suffix: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[wishlistId]) return;
  const cards = { ...map[wishlistId].cards };
  delete cards[wishCardKey(code, suffix)];
  map[wishlistId] = { ...map[wishlistId], cards };
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
    map[wishlistId] = { ...map[wishlistId], cards };
  } else {
    map[wishlistId] = {
      ...map[wishlistId],
      cards: {
        ...map[wishlistId].cards,
        [key]: { ...(map[wishlistId].cards[key] ?? { code, suffix, addedAt: Date.now() }), needed: next },
      },
    };
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
  return Object.values(cache).sort((a, b) => a.createdAt - b.createdAt);
}

// ─── Pub/sub ───────────────────────────────────────────────────────────────

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Initial hydration
read();
