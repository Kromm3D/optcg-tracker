// cardQuery.ts — single source of truth for sorting a list of cards.
//
// Browse y Binder compartían el mismo switch de ordenación (rarity/cost/power/
// owned/code/set) copiado a mano en cada pantalla. Aquí vive una sola vez:
// `sortCards(cards, sort)` devuelve una copia ordenada. El filtrado por
// criterios (matches) y la búsqueda fuzzy siguen en `filters.ts`.

import type { Card } from '../types';
import { RARITY_ORDER } from '../theme';
import { setPrefix } from './filters';
import { getOwnedFor } from './ownedAggregate';
import { SET_META } from '../data/loadIndex';

export type SortKey = 'rarity' | 'cost' | 'power' | 'owned' | 'code' | 'set';
export type SortState = { key: SortKey; dir: 'asc' | 'desc' };

function rarityOrder(card: Card): number {
  return RARITY_ORDER[card.variants[0]?.rarity?.toUpperCase() ?? ''] ?? 0;
}

function byCode(a: Card, b: Card): number {
  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

/** Comparador (ascendente) para una clave de orden concreta. */
function comparatorFor(key: SortKey): (a: Card, b: Card) => number {
  switch (key) {
    case 'rarity':
      return (a, b) => rarityOrder(a) - rarityOrder(b);
    case 'cost':
      return (a, b) => (a.cost ?? 99) - (b.cost ?? 99);
    case 'power':
      return (a, b) => (a.power ?? 0) - (b.power ?? 0);
    case 'owned':
      return (a, b) => getOwnedFor(a.code) - getOwnedFor(b.code);
    case 'set':
      // Por fecha de lanzamiento real del set (release_order: 0 = más reciente),
      // no por orden alfabético del código — así "asc" deja lo más reciente
      // primero, que es como la gente espera ver sus sets más nuevos.
      return (a, b) => {
        const ra = SET_META[setPrefix(a.code)]?.release_order ?? 9999;
        const rb = SET_META[setPrefix(b.code)]?.release_order ?? 9999;
        return ra !== rb ? ra - rb : byCode(a, b);
      };
    case 'code':
    default:
      return byCode;
  }
}

/** Devuelve una copia ordenada de `cards` según `sort`. No muta la entrada. */
export function sortCards(cards: Card[], sort: SortState): Card[] {
  const cmp = comparatorFor(sort.key);
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => dir * cmp(a, b));
}
