// Deck management: create / edit / delete named OPTCG decks.
// Each deck stores a list of { code, qty } slots (max 50 cards per OPTCG rules).
// Persisted as JSON in AsyncStorage under 'optcg.decks.v3'.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyLocalChange } from './syncBus';

const STORAGE_KEY = 'optcg.decks.v3';
/** v2 = igual shape que v3, pero sin lápidas (borrar era borrar de verdad). */
const LEGACY_KEY_V2 = 'optcg.decks.v2';
const LEGACY_KEY = 'optcg.decks.v1';

/** Cuánto se conserva la lápida de un deck borrado. Ver TOMBSTONE_TTL_MS en
 *  lib/collection.ts — mismo razonamiento (B-17, aquí repetido para decks). */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface DeckCard {
  /** Base card code (e.g. "OP01-001"). */
  code: string;
  /** Copies required in this deck (typically 1–4). */
  qty: number;
}

export interface Deck {
  id: string;
  name: string;
  /** Leader code (first card, 1 copy). */
  leaderId?: string;
  cards: DeckCard[];
  createdAt: number;
  /** Timestamp (ms) of the last change. Used by cloud sync. */
  updatedAt?: number;
  /** true = lápida (borrado localmente, pendiente de propagar). Ver B-17. */
  deleted?: boolean;
  /** Archivado: no cuenta contra `FREE_LIMITS.decks`, no aparece en la lista
   *  activa. Alternativa suave al tope — nunca se borra nada al archivar. */
  archived?: boolean;
}

type DeckMap = Record<string, Deck>;

/** ¿Es una lápida (deck borrado) en vez de un deck real? */
function isTombstone(d: Deck): boolean {
  return d.deleted === true;
}

function liveOnly(map: DeckMap): DeckMap {
  const out: DeckMap = {};
  for (const k of Object.keys(map)) if (!isTombstone(map[k])) out[k] = map[k];
  return out;
}

/** Descarta las lápidas ya caducadas (ver TOMBSTONE_TTL_MS). */
function pruneTombstones(map: DeckMap): DeckMap {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const out: DeckMap = {};
  for (const k of Object.keys(map)) {
    const d = map[k];
    if (isTombstone(d) && (d.updatedAt ?? 0) < cutoff) continue;
    out[k] = d;
  }
  return out;
}

/** Caché completa **incluyendo lápidas**: persistida y consumida por la sync. */
let cache: DeckMap | null = null;
/** Vista sin lápidas, recalculada en cada escritura. */
let live: DeckMap = {};
const listeners = new Set<() => void>();

// Migración v1 → v2: añade `updatedAt` (sellado a 0 = legacy) para la sync.
// Migración v2 → v3: añade lápidas — un registro v2 no tiene ninguna, se lee
// tal cual. Se bumpea la clave para que una app v2 no interprete una lápida
// como un deck de verdad.
async function loadRaw(): Promise<DeckMap> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) return pruneTombstones(JSON.parse(raw) as DeckMap);
  const legacy = (await AsyncStorage.getItem(LEGACY_KEY_V2)) ?? (await AsyncStorage.getItem(LEGACY_KEY));
  if (legacy) {
    const map = JSON.parse(legacy) as DeckMap;
    for (const k of Object.keys(map)) if (map[k].updatedAt == null) map[k].updatedAt = 0;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return map;
  }
  return {};
}

async function read(): Promise<DeckMap> {
  if (cache) return cache;
  try {
    cache = await loadRaw();
    live = liveOnly(cache);
  } catch {
    cache = {};
    live = {};
  }
  return cache;
}

async function write(map: DeckMap, emit = true): Promise<void> {
  cache = map;
  live = liveOnly(map);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[decks] write error:', e);
  }
  listeners.forEach((l) => l());
  if (emit) notifyLocalChange('decks');
}

/** Snapshot síncrono de los decks vivos (para la UI). [] si la caché no está lista. */
export function getCachedDecks(): Deck[] {
  return cache ? Object.values(live) : [];
}

/**
 * Caché **incluyendo lápidas**. Sólo para lib/sync.ts: el reconcile necesita
 * ver los borrados para no dejar que el servidor los resucite (B-17).
 */
export function getCacheWithTombstones(): DeckMap {
  return cache ?? {};
}

/** Reemplaza todos los decks (usado por la sync, incluye lápidas). No re-emite al bus. */
export async function replaceAllFromSync(decks: Deck[]): Promise<void> {
  const map: DeckMap = {};
  for (const d of decks) map[d.id] = d;
  await write(map, false);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function listDecks(): Promise<Deck[]> {
  await read();
  return Object.values(live).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDeck(id: string): Promise<Deck | null> {
  const map = await read();
  const d = map[id];
  return d && !isTombstone(d) ? d : null;
}

export async function createDeck(name: string): Promise<Deck> {
  const map = { ...(await read()) };
  const now = Date.now();
  const deck: Deck = {
    id: `deck_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'New Deck',
    cards: [],
    createdAt: now,
    updatedAt: now,
  };
  map[deck.id] = deck;
  await write(map);
  return deck;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id] || isTombstone(map[id])) return;
  map[id] = { ...map[id], name: name.trim(), updatedAt: Date.now() };
  await write(map);
}

/** Borra un deck localmente. Deja una lápida (B-17) en vez de borrar de
 *  verdad, para que la sync no lo resucite al ver la fila del servidor. */
export async function deleteDeck(id: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id]) return;
  map[id] = { id, name: '', cards: [], createdAt: map[id].createdAt, updatedAt: Date.now(), deleted: true };
  await write(map);
}

/** Archiva o restaura un mazo. Gratis e ilimitado (ver ToDo.md §2) — a
 *  diferencia de borrar, esto es completamente reversible y no deja lápida. */
export async function archiveDeck(id: string, archived: boolean): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id] || isTombstone(map[id])) return;
  map[id] = { ...map[id], archived, updatedAt: Date.now() };
  await write(map);
}

export async function setDeckCard(
  deckId: string,
  code: string,
  qty: number
): Promise<void> {
  const map = { ...(await read()) };
  if (!map[deckId] || isTombstone(map[deckId])) return;
  const cards = map[deckId].cards.filter((c) => c.code !== code);
  if (qty > 0) cards.push({ code, qty });
  map[deckId] = { ...map[deckId], cards, updatedAt: Date.now() };
  await write(map);
}

/** Total cards (sum of all qtys) in a deck. */
export function deckTotal(deck: Deck): number {
  return deck.cards.reduce((acc, c) => acc + c.qty, 0);
}
