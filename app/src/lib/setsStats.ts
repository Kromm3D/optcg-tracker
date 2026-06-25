// Calcula estadisticas agregadas por set: progresion total, desglose por
// rareza, y la lista de cartas. Es un helper que las pantallas SetsScreen
// y SetDetailScreen consumen.
//
// Membresia por VARIANTE: una carta pertenece a un set por cada variante
// impresa en el. Un mismo codigo base (p.ej. EB01-001) puede aparecer en
// EB01 (su print normal + parallel) y en EB02 (la reimpresion Gold Leader
// EB01-001_p2), mostrando en cada set solo las variantes que le corresponden.

import { CARD_LIST, SET_META } from '../data/loadIndex';
import { setPrefix } from './filters';
import { getOwnedFor, getVariantOwned } from './ownedAggregate';
import { getSettings } from './settings';
import type { Card, Variant } from '../types';

/** Claves de los sub-buckets de evento/promo. */
export const EV_PRERELEASE   = '__ev_prerelease';
export const EV_TREASURECUP  = '__ev_treasurecup';
export const EV_REGIONAL     = '__ev_regional';
export const EV_CS           = '__ev_cs';
export const EV_TOURNAMENT   = '__ev_tournament';
export const EV_STORE        = '__ev_store';
export const EV_COLLECTION   = '__ev_collection';
export const EV_OTHER        = '__ev_other';

/** Lista ordenada de sub-buckets de evento (para SetsScreen). */
export const EVENT_BUCKETS = [
  EV_PRERELEASE, EV_TREASURECUP, EV_REGIONAL, EV_CS,
  EV_TOURNAMENT, EV_STORE, EV_COLLECTION, EV_OTHER,
] as const;

/**
 * Clasifica un get_info sin código de set en el sub-bucket de evento correcto.
 * El orden importa: primero los patrones más específicos.
 */
function eventBucketOf(getInfo: string): string {
  const gi = getInfo.toLowerCase();
  if (gi.includes('pre-release')) return EV_PRERELEASE;
  if (gi.includes('treasure cup')) return EV_TREASURECUP;
  if (gi.startsWith('cs ') || gi.startsWith('championship') || gi.startsWith('bandai card games fest')) return EV_CS;
  if (gi.includes('regional')) return EV_REGIONAL;
  if (gi.includes('tournament pack') || gi.includes('winner pack') || gi.includes('tournament kit') || gi.includes('sealed battle')) return EV_TOURNAMENT;
  if (gi.includes('release event') || gi.includes('grand battle') || gi.includes('2-on-2') ||
      gi.includes('heroines battle') || gi.includes('deck battle') ||
      gi.includes('pirates league') || gi.includes('pirates party')) return EV_STORE;
  if (gi.includes('premium card collection') || gi.includes('illustration box') ||
      gi.includes('binder set') || gi.includes('anniversary') || gi.includes('special goods') ||
      gi.includes('official playmat') || gi.includes('learn together') ||
      gi.includes('heroines campaign')) return EV_COLLECTION;
  return EV_OTHER;
}

/** Set al que pertenece una variante concreta.
 *  - printed_set (string) → set canónico del corchete del sitio oficial
 *  - printed_set ausente/null → puede ser un insert temático del propio set
 *    (p.ej. una SP CARD "WINGS OF THE CAPTAIN" sigue siendo de OP06, solo que
 *    el scraper no le asignó printed_set) — en ese caso set_source ya trae el
 *    set real y hay que confiar en él. Solo cae a eventBucketOf() cuando
 *    set_source es 'P' (promo suelto sin set real) o falta del todo. */
export function variantSetOf(card: Card, v: Variant): string {
  if (v.printed_set) return v.printed_set;
  if (v.set_source && v.set_source !== 'P') return v.set_source;
  if (v.printed_set === undefined && !v.set_source) return setPrefix(card.code);
  return eventBucketOf(v.get_info ?? '');
}

/** Una carta dentro de un set, junto con las variantes impresas en ese set. */
export type SetEntry = {
  card: Card;
  /** Variantes de esta carta impresas en este set concreto. */
  variants: Variant[];
};

/** Whether a set entry counts as "completed" for set progression. When the
 *  countParallels setting is on, every in-set variant must be owned; otherwise
 *  owning any single in-set printing suffices. */
export function isEntryComplete(entry: SetEntry): boolean {
  const { card, variants } = entry;
  if (variants.length === 0) return getOwnedFor(card.code) > 0;
  if (getSettings().countParallels) {
    return variants.every((v) => getVariantOwned(card.code, v.suffix) > 0);
  }
  return variants.some((v) => getVariantOwned(card.code, v.suffix) > 0);
}

export type SetSummary = {
  code: string;
  entries: SetEntry[];
  /** Cartas del set (una por entry). Conservado por compatibilidad. */
  cards: Card[];
  total: number;
  owned: number;
  /** Porcentaje 0-100 redondeado al entero. */
  pct: number;
};

export type RarityBucket = {
  rarity: string;
  total: number;
  owned: number;
};

let entriesBySet: Map<string, SetEntry[]> | null = null;

function getEntriesBySet(): Map<string, SetEntry[]> {
  if (entriesBySet) return entriesBySet;
  // Agrupa (carta, variante) por set, manteniendo el orden de aparicion de
  // las cartas dentro de cada set.
  const bySet = new Map<string, Map<string, SetEntry>>();
  const ensure = (set: string, card: Card): SetEntry => {
    let cardMap = bySet.get(set);
    if (!cardMap) { cardMap = new Map(); bySet.set(set, cardMap); }
    let entry = cardMap.get(card.code);
    if (!entry) { entry = { card, variants: [] }; cardMap.set(card.code, entry); }
    return entry;
  };
  for (const c of CARD_LIST) {
    if (c.variants.length === 0) {
      // Carta sin variantes: se asigna por prefijo del codigo.
      ensure(setPrefix(c.code), c);
      continue;
    }
    for (const v of c.variants) {
      ensure(variantSetOf(c, v), c).variants.push(v);
    }
  }
  const out = new Map<string, SetEntry[]>();
  for (const [set, cardMap] of bySet) out.set(set, [...cardMap.values()]);
  entriesBySet = out;
  return out;
}

/** Lista de codigos de set ordenados por fecha de lanzamiento (más reciente primero).
 *  El orden proviene del desplegable del sitio oficial (release_order en set_meta).
 *  Sets sin entrada conocida (promos sueltos, __event__) van al final por código. */
export function listSetCodes(): string[] {
  return [...getEntriesBySet().keys()]
    .filter((k) => k !== '__event__')
    .sort((a, b) => {
      const ra = SET_META[a]?.release_order ?? 9999;
      const rb = SET_META[b]?.release_order ?? 9999;
      if (ra !== rb) return ra - rb;           // por release_order (0 = más reciente)
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

/** Entradas de un set (carta + variantes en ese set). */
export function setEntries(setCode: string): SetEntry[] {
  return getEntriesBySet().get(setCode) ?? [];
}

/** Resumen de un set (entries, total, owned, pct). */
export function summarizeSet(setCode: string): SetSummary {
  const entries = setEntries(setCode);
  const total = entries.length;
  let owned = 0;
  for (const e of entries) if (isEntryComplete(e)) owned += 1;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
  return { code: setCode, entries, cards: entries.map((e) => e.card), total, owned, pct };
}

/** Desglose por rareza dentro de un set. */
export function rarityBuckets(setCode: string): RarityBucket[] {
  const entries = setEntries(setCode);
  const map = new Map<string, RarityBucket>();
  for (const e of entries) {
    const r = e.variants[0]?.rarity?.toUpperCase() || '—';
    const b = map.get(r) ?? { rarity: r, total: 0, owned: 0 };
    b.total += 1;
    if (isEntryComplete(e)) b.owned += 1;
    map.set(r, b);
  }
  // Orden canonico de rarezas OPTCG
  const order = ['L', 'SEC', 'SR', 'SP', 'TR', 'R', 'UC', 'C', 'P'];
  return [...map.values()].sort((a, b) => {
    const ia = order.indexOf(a.rarity);
    const ib = order.indexOf(b.rarity);
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    return ra - rb;
  });
}
