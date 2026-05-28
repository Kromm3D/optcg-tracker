// Capa muy fina sobre AsyncStorage para guardar "mi colección".
//
// Modelo: un único registro JSON en la clave `optcg.collection` con un
// diccionario clave → CollectionItem. La clave es `${code}${suffix}` para
// distinguir variantes de la misma carta (ej. "OP01-001" vs "OP01-001_p1").

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CollectionItem } from '../types';

const STORAGE_KEY = 'optcg.collection.v1';

type CollectionMap = Record<string, CollectionItem>;

let cache: CollectionMap | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<CollectionMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CollectionMap) : {};
  } catch (e) {
    console.warn('[collection] error leyendo storage:', e);
    cache = {};
  }
  return cache;
}

async function write(map: CollectionMap): Promise<void> {
  cache = map;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[collection] error escribiendo storage:', e);
  }
  listeners.forEach((l) => l());
}

/** Clave que identifica una variante concreta dentro de la colección. */
export function variantKey(code: string, suffix: string): string {
  return `${code}${suffix}`;
}

/** Devuelve todos los items guardados. */
export async function listCollection(): Promise<CollectionItem[]> {
  const map = await read();
  return Object.values(map);
}

/** Devuelve cuántas copias tienes de una variante (0 si no está). */
export async function getCount(code: string, suffix: string): Promise<number> {
  const map = await read();
  return map[variantKey(code, suffix)]?.count ?? 0;
}

/** Pone la cantidad de una variante. count <= 0 la elimina. */
export async function setCount(
  code: string,
  suffix: string,
  count: number
): Promise<void> {
  const map = { ...(await read()) };
  const key = variantKey(code, suffix);
  if (count <= 0) {
    delete map[key];
  } else {
    map[key] = { key, code, suffix, count };
  }
  await write(map);
}

/** Suma `delta` (típicamente +1 o -1) al contador de una variante. */
export async function adjust(
  code: string,
  suffix: string,
  delta: number
): Promise<number> {
  const next = Math.max(0, (await getCount(code, suffix)) + delta);
  await setCount(code, suffix, next);
  return next;
}

/** Total de unidades en la colección (suma de todos los counts). */
export async function totalUnits(): Promise<number> {
  const items = await listCollection();
  return items.reduce((acc, it) => acc + it.count, 0);
}

/** Suscríbete a cambios; devuelve un unsubscribe. Útil para refrescar UIs. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
