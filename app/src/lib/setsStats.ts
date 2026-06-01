// Calcula estadisticas agregadas por set: progresion total, desglose por
// rareza, y la lista de cartas. Es un helper que las pantallas SetsScreen
// y SetDetailScreen consumen.
//
// Membresia por VARIANTE: una carta pertenece a un set por cada variante
// impresa en el. Un mismo codigo base (p.ej. EB01-001) puede aparecer en
// EB01 (su print normal + parallel) y en EB02 (la reimpresion Gold Leader
// EB01-001_p2), mostrando en cada set solo las variantes que le corresponden.

import { CARD_LIST } from '../data/loadIndex';
import { setPrefix } from './filters';
import { getOwnedFor, getVariantOwned } from './ownedAggregate';
import { getSettings } from './settings';
import type { Card, Variant } from '../types';

/** Clave especial para variantes de evento/promo sin código de set canónico. */
const EVENT_BUCKET = '__event__';

/** Set al que pertenece una variante concreta.
 *  - printed_set (string) → set canónico del corchete del sitio oficial
 *  - printed_set (null)   → evento/promo sin set code; se agrupa aparte
 *  - printed_set ausente  → datos legacy; cae a set_source o prefijo */
export function variantSetOf(card: Card, v: Variant): string {
  if (v.printed_set !== undefined) {
    return v.printed_set ?? EVENT_BUCKET;
  }
  return v.set_source || setPrefix(card.code);
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

/** Lista de codigos de set ordenados (OP01, OP02, ..., ST01, ..., EB01).
 *  Excluye el bucket especial de eventos/promos sin set code. */
export function listSetCodes(): string[] {
  return [...getEntriesBySet().keys()]
    .filter((k) => k !== '__event__')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
