// Helper que agrega los counts de variantes por codigo base.
// Util para el badge de "owned" en CardThumb sin tener que sumar a mano.

import { listCollection, getCacheSync, subscribe as subscribeCollection } from './collection';

let totals: Record<string, number> = {};
let variantTotals: Record<string, number> = {};
let variantCounts: Record<string, number> = {}; // code → nº de variantes poseídas (count > 0)
let ready = false;
const listeners = new Set<() => void>();
// Listeners que solo nos importan cuando cambia *qué* cartas posees (alta/baja),
// no cuando cambia la cantidad de una carta ya poseída. Las pantallas de lista
// (Binder) recomputan su grid solo con esto → editar copias no recalcula 4500 cartas.
const membershipListeners = new Set<() => void>();
let prevKeys = new Set<string>(); // claves de variante con count > 0 en el último refresh

// Recalculo síncrono desde la caché en memoria: se ejecuta en el mismo tick
// que el listener de collection, así la UI nunca ve un estado intermedio.
function refresh() {
  const items = Object.values(getCacheSync());
  const next: Record<string, number> = {};
  const nextVar: Record<string, number> = {};
  const nextCounts: Record<string, number> = {};
  const nextKeys = new Set<string>();
  for (const it of items) {
    next[it.code] = (next[it.code] ?? 0) + it.count;
    const vk = `${it.code}${it.suffix}`;
    nextVar[vk] = it.count;
    if (it.count > 0) {
      nextCounts[it.code] = (nextCounts[it.code] ?? 0) + 1;
      nextKeys.add(vk);
    }
  }
  totals = next;
  variantTotals = nextVar;
  variantCounts = nextCounts;
  ready = true;

  // ¿Ha cambiado el *conjunto* de variantes poseídas? (alguna 0→>0 o >0→0)
  let membershipChanged = nextKeys.size !== prevKeys.size;
  if (!membershipChanged) {
    for (const k of nextKeys) {
      if (!prevKeys.has(k)) { membershipChanged = true; break; }
    }
  }
  prevKeys = nextKeys;

  listeners.forEach((l) => l());
  if (membershipChanged) membershipListeners.forEach((l) => l());
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

/** Suscríbete solo a cambios de *pertenencia* (una carta entra/sale de la
 *  colección). No se dispara al cambiar la cantidad de una carta ya poseída.
 *  Úsalo para refrescar listas/grids sin recomputarlas en cada +/-. */
export function subscribeMembership(listener: () => void): () => void {
  membershipListeners.add(listener);
  return () => membershipListeners.delete(listener);
}
