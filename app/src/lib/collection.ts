// Capa muy fina sobre AsyncStorage para guardar "mi colección".
//
// Modelo: un único registro JSON en la clave `optcg.collection` con un
// diccionario clave → CollectionItem. La clave es `${code}${suffix}` para
// distinguir variantes de la misma carta (ej. "OP01-001" vs "OP01-001_p1").

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardCondition, CardLanguage, CollectionItem, GradedInfo } from '../types';
import { notifyLocalChange } from './syncBus';

const STORAGE_KEY = 'optcg.collection.v4';
/** v3 = igual shape que v4, pero sin tombstones (borrar era borrar de verdad). */
const LEGACY_KEY_V3 = 'optcg.collection.v3';
/** v2 = igual shape que v3 salvo los metadatos físicos, todos opcionales. */
const LEGACY_KEY = 'optcg.collection.v2';
const LEGACY_KEY_V1 = 'optcg.collection.v1';

/**
 * Cuánto se conserva la lápida de una variante borrada (B-17).
 *
 * Una entrada con `count: 0` existe para poder decirle al servidor "esto lo
 * borré yo, no me lo devuelvas". Pasado un tiempo largo comparado con lo que
 * tarda cualquier dispositivo en sincronizar, el borrado ya está propagado y la
 * lápida solo ocupa sitio.
 */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type CollectionMap = Record<string, CollectionItem>;

/** ¿Es una lápida (variante borrada) en vez de un montón que posees? */
function isTombstone(it: CollectionItem): boolean {
  return it.count <= 0;
}

/** Deja solo lo que el usuario posee de verdad. */
function liveOnly(map: CollectionMap): CollectionMap {
  const out: CollectionMap = {};
  for (const k of Object.keys(map)) if (!isTombstone(map[k])) out[k] = map[k];
  return out;
}

/**
 * Caché completa **incluyendo lápidas**: es la que se persiste y la que
 * consume la sync. Todo lo demás debe leer `live`, para que una lápida no se
 * pueda colar en la interfaz como una carta con 0 copias.
 */
let cache: CollectionMap | null = null;
/** Vista sin lápidas, recalculada en cada escritura (evita filtrar por render). */
let live: CollectionMap = {};
let pendingRead: Promise<CollectionMap> | null = null;
const listeners = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

// Migración v1 → v2: el shape no cambia salvo el campo opcional `updatedAt`
// (usado por la sync LWW). Los items legacy se sellan con un timestamp antiguo
// (0) para que cualquier dato del servidor gane en el primer reconcile.
// Migración v2 → v3: puramente aditiva (condition/language/graded/coste base,
// todos opcionales) — un registro v2 ya es un registro v3 válido, así que la
// conversión es una copia. Se bumpea la clave igualmente por convención, para
// que un downgrade de la app no lea datos que no entiende.
// Migración v3 → v4: aditiva también. Un registro v3 no tiene lápidas, así que
// se lee tal cual; las lápidas empiezan a aparecer con el primer borrado que
// haga esta versión. Se bumpea la clave porque una app v3 leyendo datos v4
// interpretaría las lápidas como cartas con 0 copias.
async function loadRaw(): Promise<CollectionMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) return pruneTombstones(JSON.parse(raw) as CollectionMap);
  const legacy =
    (await AsyncStorage.getItem(LEGACY_KEY_V3)) ??
    (await AsyncStorage.getItem(LEGACY_KEY)) ??
    (await AsyncStorage.getItem(LEGACY_KEY_V1));
  if (legacy) {
    const map = JSON.parse(legacy) as CollectionMap;
    for (const k of Object.keys(map)) if (map[k].updatedAt == null) map[k].updatedAt = 0;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return map;
  }
  return {};
}

/** Descarta las lápidas ya caducadas (ver TOMBSTONE_TTL_MS). */
function pruneTombstones(map: CollectionMap): CollectionMap {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const out: CollectionMap = {};
  for (const k of Object.keys(map)) {
    const it = map[k];
    if (isTombstone(it) && (it.updatedAt ?? 0) < cutoff) continue;
    out[k] = it;
  }
  return out;
}

async function read(): Promise<CollectionMap> {
  if (cache) return cache;
  if (pendingRead) return pendingRead;
  pendingRead = loadRaw()
    .then((map) => {
      cache = map;
      live = liveOnly(map);
      return cache;
    })
    .catch((e) => {
      console.warn('[collection] error leyendo storage:', e);
      cache = {};
      live = {};
      return cache;
    })
    .finally(() => {
      pendingRead = null;
    });
  return pendingRead;
}

function write(map: CollectionMap): void {
  cache = map;
  live = liveOnly(map);
  // Notificar inmediatamente (la UI se actualiza sin esperar al disco).
  listeners.forEach((l) => l());
  notifyLocalChange('collection');
  // Persistir en background con debounce: N taps rápidos → 1 sola escritura.
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map)).catch((e) =>
      console.warn('[collection] error escribiendo storage:', e)
    );
  }, 300);
}

/** Reemplaza toda la colección (usado por la sync al reconciliar). No re-emite
 *  al bus para evitar bucles de sincronización. */
export function replaceAllFromSync(items: CollectionItem[]): void {
  const map: CollectionMap = {};
  for (const it of items) map[it.key] = it;
  cache = map;
  live = liveOnly(map);
  listeners.forEach((l) => l());
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map)).catch(() => {});
  }, 300);
}

/**
 * Construye la lápida de una variante borrada.
 *
 * Se tiran los metadatos físicos a propósito: si dejas de tener la carta, lo
 * que pagaste por ella y en qué estado estaba dejan de describir nada. Volver a
 * añadirla parte de cero, igual que cuando borrar era borrar de verdad.
 */
function tombstone(key: string, code: string, suffix: string): CollectionItem {
  return { key, code, suffix, count: 0, updatedAt: Date.now() };
}

/** Clave que identifica una variante concreta dentro de la colección. */
export function variantKey(code: string, suffix: string): string {
  return `${code}${suffix}`;
}

/** Devuelve los montones que posees (sin lápidas). */
export async function listCollection(): Promise<CollectionItem[]> {
  await read();
  return Object.values(live);
}

/** Devuelve cuántas copias tienes de una variante (0 si no está). */
export async function getCount(code: string, suffix: string): Promise<number> {
  const map = await read();
  return map[variantKey(code, suffix)]?.count ?? 0;
}

/**
 * Caché **incluyendo lápidas**. Sólo para lib/sync.ts: el reconcile necesita
 * ver los borrados para no dejar que el servidor los resucite (B-17). La
 * interfaz nunca debe usar esto.
 */
export function getCacheWithTombstones(): CollectionMap {
  return cache ?? {};
}

/** Snapshot síncrono de lo que posees. Vacío si la caché aún no está lista.
 *  Excluye lápidas — ver getCacheWithTombstones() si necesitas los borrados. */
export function getCacheSync(): CollectionMap {
  return live;
}

/** Devuelve cuántas copias tienes de una variante, síncronamente desde la caché.
 *  Devuelve 0 si la caché aún no se ha cargado. */
export function getCountSync(code: string, suffix: string): number {
  return cache?.[variantKey(code, suffix)]?.count ?? 0;
}

/** Pone la cantidad de una variante. count <= 0 la marca como borrada. */
export async function setCount(
  code: string,
  suffix: string,
  count: number
): Promise<void> {
  const map = { ...(await read()) };
  const key = variantKey(code, suffix);
  if (count <= 0) {
    map[key] = tombstone(key, code, suffix);
  } else {
    // Se conservan los metadatos físicos del montón (condición, idioma,
    // gradeo, coste base) — cambiar la cantidad no los invalida.
    map[key] = { ...map[key], key, code, suffix, count, updatedAt: Date.now() };
  }
  write(map);
}

/** Suma `delta` (típicamente +1 o -1) al contador de una variante. */
export async function adjust(
  code: string,
  suffix: string,
  delta: number
): Promise<number> {
  const map = await read();
  const key = variantKey(code, suffix);
  const next = Math.max(0, (map[key]?.count ?? 0) + delta);
  const newMap = { ...map };
  if (next <= 0) {
    newMap[key] = tombstone(key, code, suffix);
  } else {
    newMap[key] = { ...map[key], key, code, suffix, count: next, updatedAt: Date.now() };
  }
  write(newMap);
  return next;
}

// ─── Metadatos físicos del montón (condición, idioma, gradeo, coste) ────────

/** Campos editables por el usuario en la hoja de detalles de una copia. */
export interface CollectionMeta {
  condition?: CardCondition;
  language?: CardLanguage;
  graded?: GradedInfo;
  acquiredUnitPrice?: number;
  acquiredAt?: number;
}

/** Lectura síncrona de los metadatos de una variante. `{}` si no hay item. */
export function getMetaSync(code: string, suffix: string): CollectionMeta {
  // `live`, no `cache`: una lápida no tiene metadatos que enseñar.
  const it = live[variantKey(code, suffix)];
  if (!it) return {};
  return {
    condition: it.condition,
    language: it.language,
    graded: it.graded,
    acquiredUnitPrice: it.acquiredUnitPrice,
    acquiredAt: it.acquiredAt,
  };
}

/** Fusiona metadatos sobre una variante. Pasar `undefined` en un campo lo deja
 *  como estaba; para borrarlo, pasar `null`. No crea el item si no lo tienes. */
export async function setMeta(
  code: string,
  suffix: string,
  meta: { [K in keyof CollectionMeta]?: CollectionMeta[K] | null },
): Promise<void> {
  const map = await read();
  const key = variantKey(code, suffix);
  const existing = map[key];
  // Una lápida cuenta como "no lo tienes": ponerle metadatos la convertiría en
  // un montón fantasma de 0 copias con estado y precio de compra.
  if (!existing || existing.count <= 0) return;
  const next = { ...existing, updatedAt: Date.now() } as CollectionItem & Record<string, unknown>;
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  write({ ...map, [key]: next });
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
