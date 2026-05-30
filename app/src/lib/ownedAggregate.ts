// Helper que agrega los counts de variantes por codigo base.
// Util para el badge de "owned" en CardThumb sin tener que sumar a mano.

import { listCollection, subscribe as subscribeCollection } from './collection';

let totals: Record<string, number> = {};
let ready = false;
const listeners = new Set<() => void>();

async function refresh() {
  const items = await listCollection();
  const next: Record<string, number> = {};
  for (const it of items) {
    next[it.code] = (next[it.code] ?? 0) + it.count;
  }
  totals = next;
  ready = true;
  listeners.forEach((l) => l());
}

// Hidratacion inicial + suscripcion a cambios en collection
refresh();
subscribeCollection(refresh);

export function getOwnedTotals(): Record<string, number> {
  return totals;
}

export function getOwnedFor(code: string): number {
  return totals[code] ?? 0;
}

export function isReady(): boolean {
  return ready;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
