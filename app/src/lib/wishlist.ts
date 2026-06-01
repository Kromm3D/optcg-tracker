// Wishlist: lista de codigos de carta que el usuario quiere tener.
// Se guarda en AsyncStorage como JSON. A diferencia de la coleccion,
// no distingue variantes — la wishlist es a nivel de codigo base.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WishlistItem } from '../types';

const STORAGE_KEY = 'optcg.wishlist.v1';

let cache: Record<string, WishlistItem> | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<Record<string, WishlistItem>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, WishlistItem>) : {};
  } catch (e) {
    console.warn('[wishlist] error leyendo storage:', e);
    cache = {};
  }
  return cache;
}

async function write(map: Record<string, WishlistItem>): Promise<void> {
  cache = map;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[wishlist] error escribiendo storage:', e);
  }
  listeners.forEach((l) => l());
}

export async function listWishlist(): Promise<WishlistItem[]> {
  const map = await read();
  return Object.values(map);
}

export async function isWished(code: string): Promise<boolean> {
  const map = await read();
  return !!map[code];
}

export async function toggleWish(code: string): Promise<boolean> {
  const map = { ...(await read()) };
  if (map[code]) {
    delete map[code];
    await write(map);
    return false;
  }
  map[code] = { code, addedAt: Date.now(), needed: 1 };
  await write(map);
  return true;
}

/** Add (or update) a wishlist entry with an explicit needed count.
 *  If the card is already wished, the needed qty is replaced (not added). */
export async function addToWishlist(code: string, needed: number): Promise<void> {
  const map = { ...(await read()) };
  map[code] = { code, addedAt: map[code]?.addedAt ?? Date.now(), needed: Math.max(1, needed) };
  await write(map);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
