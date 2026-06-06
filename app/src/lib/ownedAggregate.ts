// Helper que agrega los counts de variantes por codigo base.
// Util para el badge de "owned" en CardThumb sin tener que sumar a mano.

import { listCollection, getCacheSync, subscribe as subscribeCollection } from './collection';

let totals: Record<string, number> = {};
let variantTotals: Record<string, number> = {};
let variantCounts: Record<string, number> = {}; // code → nº de variantes poseídas (count > 0)
let ready = false;
const listeners = new Set<() => void>();

// Recalculo síncrono desde la caché en memoria: se ejecuta en el mismo tick
// que el listener de collection, así la UI nunca ve un estado intermedio.
function refresh() {
  const items = Object.values(getCacheSync());
  const next: Record<string, number> = {};
  const nextVar: Record<string, number> = {};
  const nextCounts: Record<string, number> = {};
  for (const it of items) {
    next[it.code] = (next[it.code] ?? 0) + it.count;
    nextVar[`${it.code}${it.suffix}`] = it.count;
    if (it.count > 0) nextCounts[it.code] = (nextCounts[it.code] ?? 0) + 1;
  }
  totals = next;
  variantTotals = nextVar;
  variantCounts = nextCounts;
  ready = true;
  listeners.forEach((l) => l());
}

// Hidratacion inicial: esperar a que collection cargue del disco, luego sync.
listCollection().then(() => refresh());
subscribeCollection(refresh);

export function getOwnedTotals(): Record<string, number> {
  return totals;
}

export function getOwnedFor(code: string): number {
  return totals[code] ?? 0;
}

/** Copies owned of a specific variant (code + suffix). */
export function getVariantOwned(code: string, suffix: string): number {
  return variantTotals[`${code}${suffix}`] ?? 0;
}

/** Number of distinct art variants of a card owned with count > 0.
 *  Powers the multi-art indicator (≥ 2 means owned across several arts). */
export function getOwnedVariantCount(code: string): number {
  return variantCounts[code] ?? 0;
}

export function isReady(): boolean {
  return ready;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
