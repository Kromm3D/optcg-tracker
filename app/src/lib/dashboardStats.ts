// Dashboard avanzado de estadísticas — suscripción 'cloud' (ToDo.md §4).
// Todo lo de aquí se deriva de datos que ya existen (setsStats.ts,
// portfolio.ts, ownedAggregate.ts): esto sólo los agrega en las 4 vistas que
// pide el ToDo, no añade ninguna fuente de datos nueva.

import { CARD_LIST, CARDS } from '../data/loadIndex';
import { getCacheSync } from './collection';
import { itemValue } from './portfolio';
import { listSetCodes, summarizeSet, variantSetOf, type SetSummary } from './setsStats';
import { setNameFor } from './setMeta';
import { getOwnedFor } from './ownedAggregate';
import type { Card, CollectionItem, Variant } from '../types';

export type SetValue = { code: string; name: string; value: number };

/** Valor de mercado de la colección, agregado por set. Sólo sets con valor > 0. */
export function valueBySet(): SetValue[] {
  const totals = new Map<string, number>();
  for (const item of Object.values(getCacheSync())) {
    if (item.count <= 0) continue;
    const card = CARDS[item.code];
    const variant = card?.variants.find((v) => v.suffix === item.suffix);
    if (!card || !variant) continue;
    const set = variantSetOf(card, variant);
    totals.set(set, (totals.get(set) ?? 0) + itemValue(item));
  }
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .map(([code, value]) => ({ code, name: setNameFor(code), value }))
    .sort((a, b) => b.value - a.value);
}

/** % de completitud por set, sets ordenados por progreso descendente. */
export function completionBySet(): SetSummary[] {
  return listSetCodes()
    .map((code) => summarizeSet(code))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.pct - a.pct);
}

export type ValuableItem = { item: CollectionItem; card: Card; variant: Variant; value: number };

/** Las N cartas más valiosas de la colección (por montón, no por copia). */
export function topValuableItems(n = 10): ValuableItem[] {
  const out: ValuableItem[] = [];
  for (const item of Object.values(getCacheSync())) {
    if (item.count <= 0) continue;
    const card = CARDS[item.code];
    const variant = card?.variants.find((v) => v.suffix === item.suffix);
    if (!card || !variant) continue;
    const value = itemValue(item);
    if (value <= 0) continue;
    out.push({ item, card, variant, value });
  }
  out.sort((a, b) => b.value - a.value);
  return out.slice(0, n);
}

export type RarityStat = { rarity: string; owned: number; total: number };

/** Distribución de cartas únicas poseídas por rareza (base, no por variante). */
export function rarityDistribution(): RarityStat[] {
  const buckets = new Map<string, RarityStat>();
  for (const card of CARD_LIST) {
    const base = card.variants.find((v) => v.suffix === '') ?? card.variants[0];
    const rarity = base?.rarity?.toUpperCase() || '—';
    const b = buckets.get(rarity) ?? { rarity, owned: 0, total: 0 };
    b.total += 1;
    if (getOwnedFor(card.code) > 0) b.owned += 1;
    buckets.set(rarity, b);
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total);
}
