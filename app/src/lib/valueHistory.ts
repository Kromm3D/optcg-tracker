// Histórico del valor de la colección (vault value) a lo largo del tiempo.
//
// Modelo: un único registro JSON en `optcg.valueHistory.v1` con una serie de
// snapshots diarios { date: 'YYYY-MM-DD', value }. Se toma como mucho 1 punto
// por día (el último valor del día gana). Mismo patrón cache + listeners que
// el resto de stores (collection/settings).
//
// LOCAL-ONLY por ahora (el valor del vault es privado — los amigos verán el
// binder, no el valor; ver memoria friends-social-plan). Pero el shape es
// serializable y lleva `updatedAt`, listo para una sync futura sin reescritura.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'optcg.valueHistory.v1';
// Un año de tendencia (~3 KB). Recorta los puntos más antiguos al superarlo.
const MAX_POINTS = 365;
const DAY_MS = 86_400_000;

export interface ValuePoint {
  /** Fecha local en formato 'YYYY-MM-DD'. */
  date: string;
  /** Valor total de la colección (EUR) en esa fecha. */
  value: number;
}

interface ValueHistory {
  schemaVersion: 1;
  points: ValuePoint[];
  /** Timestamp (ms) del último cambio. Para una sync LWW futura. */
  updatedAt: number;
}

export type ValueTimeframeDays = 7 | 30 | typeof ALL_DAYS;
/** Sentinela para "todo el histórico" en las funciones por ventana. */
export const ALL_DAYS = 100_000;

let cache: ValueHistory | null = null;
let pendingRead: Promise<ValueHistory> | null = null;
const listeners = new Set<() => void>();

/** Clave de día local (no UTC, para que "hoy" coincida con el reloj del usuario). */
function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function empty(): ValueHistory {
  return { schemaVersion: 1, points: [], updatedAt: 0 };
}

async function loadRaw(): Promise<ValueHistory> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as ValueHistory;
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.points)) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

async function read(): Promise<ValueHistory> {
  if (cache) return cache;
  if (pendingRead) return pendingRead;
  pendingRead = loadRaw()
    .then((h) => {
      cache = h;
      return h;
    })
    .catch((e) => {
      console.warn('[valueHistory] error leyendo storage:', e);
      cache = empty();
      return cache;
    })
    .finally(() => {
      pendingRead = null;
    });
  return pendingRead;
}

function persist(h: ValueHistory): void {
  cache = h;
  // Notificar antes del disco: la UI se refresca sin esperar al write.
  listeners.forEach((l) => l());
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(h)).catch((e) =>
    console.warn('[valueHistory] error escribiendo storage:', e)
  );
}

/**
 * Registra el valor de HOY. Idempotente por día: si ya existe el punto de hoy
 * lo actualiza al último valor; si no, lo añade. No escribe si el valor no ha
 * cambiado (evita writes/renders redundantes). Pensado para llamarse de forma
 * pasiva al abrir la app, no como entrada manual.
 */
export async function recordDailySnapshot(value: number): Promise<void> {
  if (!Number.isFinite(value) || value < 0) return;
  const h = await read();
  const today = dayKey();
  const rounded = Math.round(value * 100) / 100;
  const points = h.points.slice();
  const last = points[points.length - 1];
  if (last && last.date === today) {
    if (last.value === rounded) return; // sin cambios → no-op
    points[points.length - 1] = { date: today, value: rounded };
  } else {
    points.push({ date: today, value: rounded });
  }
  if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS);
  persist({ schemaVersion: 1, points, updatedAt: Date.now() });
}

/** Snapshot síncrono de toda la serie (vacío si la caché aún no está lista). */
export function getHistorySync(): ValuePoint[] {
  return cache?.points ?? [];
}

/** Puntos dentro de la ventana de `days` días (ALL_DAYS = todos). */
export function getSeries(days: number): ValuePoint[] {
  const points = cache?.points ?? [];
  if (days >= ALL_DAYS) return points;
  const cutoff = dayKey(new Date(Date.now() - days * DAY_MS));
  return points.filter((p) => p.date >= cutoff);
}

/**
 * Serie de valores para la sparkline, con el último punto sustituido por el
 * `currentValue` en vivo (el snapshot persistido puede ir un paso por detrás
 * mientras el usuario añade cartas durante el día).
 */
export function getDisplaySeries(currentValue: number, days: number): number[] {
  const pts = getSeries(days);
  const rounded = Math.round(currentValue * 100) / 100;
  const today = dayKey();
  const vals = pts.map((p) => p.value);
  if (pts.length && pts[pts.length - 1].date === today) {
    vals[vals.length - 1] = rounded;
  } else {
    vals.push(rounded);
  }
  return vals;
}

export interface ValueDelta {
  /** currentValue − valor de referencia (EUR). */
  amount: number;
  /** Variación porcentual respecto a la referencia. */
  pct: number;
  /** Fecha del punto de referencia usado. */
  fromDate: string;
  /** true si existía un punto que cubre toda la ventana solicitada. */
  full: boolean;
}

/**
 * Delta entre `currentValue` y el punto de hace ~`days` días. Si no hay punto
 * tan antiguo, usa el más antiguo disponible (full=false). Devuelve null cuando
 * solo existe el punto de hoy (aún no hay con qué comparar → estado first-run).
 */
export function getDelta(currentValue: number, days: number): ValueDelta | null {
  const points = cache?.points ?? [];
  if (points.length === 0) return null;

  const cutoff = dayKey(new Date(Date.now() - days * DAY_MS));
  let ref: ValuePoint | null = null;
  let full = false;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].date <= cutoff) {
      ref = points[i];
      full = true;
      break;
    }
  }
  if (!ref) {
    const oldest = points[0];
    if (oldest.date === dayKey()) return null; // solo tenemos hoy
    ref = oldest;
    full = false;
  }

  const amount = currentValue - ref.value;
  const pct = ref.value > 0 ? (amount / ref.value) * 100 : 0;
  return { amount, pct, fromDate: ref.date, full };
}

/** Suscríbete a cambios del histórico; devuelve un unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Hidratación inicial.
read();
