// Helper que agrega los counts de variantes por codigo base.
// Util para el badge de "owned" en CardThumb sin tener que sumar a mano.

import { listCollection, getCacheSync, subscribe as subscribeCollection } from './collection';

let totals: Record<string, number> = {};
let variantTotals: Record<string, number> = {};
let ready = false;
const listeners = new Set<() => void>();

// Recalculo síncrono desde la caché en memoria: se ejecuta en el mismo tick
// que el listener de collection, así la UI nunca ve un estado intermedio.
function refresh() {
  const items = Object.values(getCacheSync());
  const next: Record<string, number> = {};
  const nextVar: Record<string, number> = {};
  for (const it of items) {
    next[it.code] = (next[it.code] ?? 0) + it.count;
    nextVar[`${it.code}${it.suffix}`] = it.count;
  }
  totals = next;
  variantTotals = nextVar;
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
  let n = 0;
  for (const key of Object.keys(variantTotals)) {
    // key === `${code}${suffix}`; match exact code or code + "_…" suffix.
    if ((key === code || key.startsWith(`${code}_`)) && variantTotals[key] > 0) n += 1;
  }
  return n;
}

export function isReady(): boolean {
  return ready;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
