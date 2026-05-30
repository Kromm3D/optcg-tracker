// Calcula estadisticas agregadas por set: progresion total, desglose por
// rareza, y la lista de cartas. Es un helper que las pantallas SetsScreen
// y SetDetailScreen consumen.

import { CARD_LIST } from '../data/loadIndex';
import { setPrefix } from './filters';
import { getOwnedFor } from './ownedAggregate';
import type { Card } from '../types';

export type SetSummary = {
  code: string;
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

let cardsBySet: Map<string, Card[]> | null = null;

function getCardsBySet(): Map<string, Card[]> {
  if (cardsBySet) return cardsBySet;
  const m = new Map<string, Card[]>();
  for (const c of CARD_LIST) {
    const p = setPrefix(c.code);
    const arr = m.get(p) ?? [];
    arr.push(c);
    m.set(p, arr);
  }
  cardsBySet = m;
  return m;
}

/** Lista de codigos de set ordenados (OP01, OP02, ..., ST01, ..., EB01). */
export function listSetCodes(): string[] {
  return [...getCardsBySet().keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

/** Resumen de un set (cards, total, owned, pct). */
export function summarizeSet(setCode: string): SetSummary {
  const cards = getCardsBySet().get(setCode) ?? [];
  const total = cards.length;
  let owned = 0;
  for (const c of cards) if (getOwnedFor(c.code) > 0) owned += 1;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
  return { code: setCode, cards, total, owned, pct };
}

/** Desglose por rareza dentro de un set. */
export function rarityBuckets(setCode: string): RarityBucket[] {
  const cards = getCardsBySet().get(setCode) ?? [];
  const map = new Map<string, RarityBucket>();
  for (const c of cards) {
    const r = c.variants[0]?.rarity?.toUpperCase() || '—';
    const b = map.get(r) ?? { rarity: r, total: 0, owned: 0 };
    b.total += 1;
    if (getOwnedFor(c.code) > 0) b.owned += 1;
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
