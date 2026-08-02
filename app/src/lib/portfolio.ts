// portfolio.ts — valoración de la colección como cartera.
//
// Hasta ahora Home sumaba `count × getPrice(card)` y lo llamaba "valor del
// vault". Eso responde a "cuánto vale", pero no a la pregunta que de verdad
// tiene un coleccionista: **"¿voy ganando?"**. Este módulo añade las dos
// piezas que faltaban:
//
//   1. El valor de mercado tiene en cuenta el estado físico y el gradeo de
//      cada montón (ver CONDITION_MULTIPLIER / gradeMultiplier en prices.ts).
//   2. Frente a ese valor se pone el **coste base**: lo que el usuario dijo
//      haber pagado (CollectionItem.acquiredUnitPrice). Sólo las variantes con
//      coste declarado entran en el P&L — mezclar "compré esto por 20 €" con
//      "esto no sé qué me costó" daría una cifra sin significado.
//
// Todos los importes van en EUR (divisa base). La conversión para mostrar es
// responsabilidad de lib/currency.ts.

import { CARDS } from '../data/loadIndex';
import type { CollectionItem } from '../types';
import { getCacheSync } from './collection';
import { CONDITION_MULTIPLIER, getPrice, gradeMultiplier } from './prices';
import { getSettings } from './settings';

/** Multiplicador de valor aplicable a un montón según su estado/gradeo. */
export function conditionFactor(item: Pick<CollectionItem, 'condition' | 'graded'>): number {
  if (item.graded) return gradeMultiplier(item.graded.grade);
  if (!item.condition) return 1;
  return CONDITION_MULTIPLIER[item.condition] ?? 1;
}

/** Valor de mercado (EUR) de un montón concreto: precio × copias × estado. */
export function itemValue(item: CollectionItem): number {
  const card = CARDS[item.code];
  if (!card) return 0;
  const unit = getPrice(card, item.suffix);
  const factor = getSettings().valueByCondition ? conditionFactor(item) : 1;
  return unit * factor * item.count;
}

export interface PortfolioSummary {
  /** Valor de mercado total de la colección, en EUR. */
  marketValue: number;
  /** Coste base declarado, en EUR — sólo las variantes con precio de compra. */
  costBasis: number;
  /** Valor de mercado **de esas mismas variantes**, comparable con costBasis. */
  trackedValue: number;
  /** trackedValue − costBasis. */
  profit: number;
  /** Rentabilidad sobre el coste, en %. 0 si no hay coste declarado. */
  profitPct: number;
  /** Cuántas variantes distintas tienen coste declarado. */
  trackedVariants: number;
  /** Cuántas variantes distintas hay en total en la colección. */
  totalVariants: number;
}

/** Resumen síncrono de la cartera desde la caché de colección. */
export function getPortfolio(): PortfolioSummary {
  let marketValue = 0;
  let costBasis = 0;
  let trackedValue = 0;
  let trackedVariants = 0;
  let totalVariants = 0;

  for (const item of Object.values(getCacheSync())) {
    if (item.count <= 0) continue;
    totalVariants += 1;
    const value = itemValue(item);
    marketValue += value;
    if (item.acquiredUnitPrice != null) {
      trackedVariants += 1;
      costBasis += item.acquiredUnitPrice * item.count;
      trackedValue += value;
    }
  }

  const profit = trackedValue - costBasis;
  return {
    marketValue,
    costBasis,
    trackedValue,
    profit,
    profitPct: costBasis > 0 ? (profit / costBasis) * 100 : 0,
    trackedVariants,
    totalVariants,
  };
}
