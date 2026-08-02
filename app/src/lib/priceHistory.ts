// Historial de precios ligero para mostrar el % de cambio en las cartas.
//
// data/prices.json sólo trae un precio puntual por carta (sin serie temporal),
// así que el delta lo calculamos nosotros: guardamos el snapshot de la última
// publicación de precios vista y, cuando el CDN publica una nueva (cambia
// PRICES_META.generated), la anterior pasa a ser la referencia "previa". El %
// es entonces la variación real entre las dos últimas publicaciones (≈ semanal).
//
// Primera ejecución (o hasta el primer refresco de precios): no hay referencia
// previa → getPriceChangePct devuelve null y la UI muestra "0.0%".

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRICES_META, snapshotRealPrices, realTrend } from './prices';

const KEY = 'optcg.priceHistory.v2';
const LEGACY_KEY = 'optcg.priceHistory.v1';

/** Un punto de la serie de una carta: cuándo se publicó y a cuánto estaba. */
export interface PricePoint {
  /** Timestamp (ms) en que esta app vio la publicación. */
  at: number;
  /** Precio en EUR (divisa base del catálogo). */
  price: number;
}

/**
 * Cuántas publicaciones se conservan por carta. A cadencia semanal son ~6
 * meses, que es el horizonte con el que un coleccionista decide comprar o
 * esperar. Más allá, la serie deja de informar y sólo ocupa.
 */
const MAX_POINTS = 26;

type Store = {
  curGen: string;                  // `generated` de la publicación actual
  cur: Record<string, number>;     // snapshot de la publicación actual
  prevGen: string;                 // `generated` de la publicación anterior
  prev: Record<string, number>;    // snapshot anterior (referencia del delta)
  /**
   * Serie por variante. **Sólo para las cartas que le importan al usuario**
   * (las que tiene o desea): guardar la serie de las ~4600 variantes del
   * catálogo multiplicaría por 26 un fichero que ya pesa, para pintar gráficas
   * que nadie va a mirar.
   */
  series?: Record<string, PricePoint[]>;
};

// Referencia previa en memoria (clave variante -> precio). Vacío hasta init().
let prevPrices: Record<string, number> = {};
let series: Record<string, PricePoint[]> = {};
let initialized = false;

/** Carga/rota el snapshot de precios. Llamar una vez al arrancar (App.tsx). */
export async function initPriceHistory(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const gen = PRICES_META.generated || '';
  try {
    const raw = (await AsyncStorage.getItem(KEY)) ?? (await AsyncStorage.getItem(LEGACY_KEY));
    const stored: Store | null = raw ? JSON.parse(raw) : null;
    series = stored?.series ?? {};

    if (!stored) {
      // Primera vez: fijamos la línea base, sin referencia previa todavía.
      prevPrices = {};
      await persist({ curGen: gen, cur: snapshotRealPrices(), prevGen: '', prev: {} });
    } else if (stored.curGen !== gen) {
      // Nueva publicación de precios → la "actual" anterior pasa a ser "previa".
      prevPrices = stored.cur || {};
      appendSeriesPoint();
      await persist({ curGen: gen, cur: snapshotRealPrices(), prevGen: stored.curGen, prev: prevPrices });
    } else {
      // Misma publicación: conservamos la referencia previa ya guardada.
      prevPrices = stored.prev || {};
    }
  } catch {
    // AsyncStorage no disponible (p.ej. SSR/web sin storage): sin deltas.
    prevPrices = {};
    series = {};
  }
}

async function persist(base: Omit<Store, 'series'>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...base, series }));
}

/**
 * Añade el precio de esta publicación a la serie de cada carta seguida.
 *
 * Sólo se llama cuando `generated` cambia, así que abrir la app diez veces el
 * mismo día no produce diez puntos idénticos: la serie tiene exactamente una
 * muestra por publicación de precios, que es lo que representa.
 */
function appendSeriesPoint(): void {
  const now = Date.now();
  for (const key of trackedKeys()) {
    const price = realTrend(...splitKey(key));
    if (price == null) continue;
    const arr = series[key] ?? [];
    arr.push({ at: now, price });
    series[key] = arr.slice(-MAX_POINTS);
  }
}

/** Variantes que el usuario tiene o desea — las únicas cuya serie se guarda. */
function trackedKeys(): string[] {
  // `require` diferido: priceHistory se inicializa desde App.tsx muy pronto y
  // un import estático crearía un ciclo con collection/wishlists, que a su vez
  // importan syncBus.
  const { getCacheSync } = require('./collection') as typeof import('./collection');
  const { getCachedWishlists } = require('./wishlists') as typeof import('./wishlists');
  const keys = new Set<string>();
  for (const it of Object.values(getCacheSync())) if (it.count > 0) keys.add(it.key);
  for (const wl of getCachedWishlists()) for (const k of Object.keys(wl.cards)) keys.add(k);
  return [...keys];
}

/** Separa `OP01-001_p1` en `['OP01-001', '_p1']`. El código base siempre es
 *  `XXNN-NNN`; todo lo que venga después es el sufijo de variante. */
function splitKey(key: string): [string, string] {
  const i = key.indexOf('_');
  return i === -1 ? [key, ''] : [key.slice(0, i), key.slice(i)];
}

/**
 * Serie histórica de una variante, con el precio de hoy añadido al final.
 *
 * Devuelve `[]` si nunca se ha registrado nada: la UI debe distinguir "aún no
 * hay histórico" de "el precio lleva plano desde siempre".
 */
export function getPriceSeries(code: string, suffix: string = ''): PricePoint[] {
  const stored = series[`${code}${suffix}`] ?? series[code] ?? [];
  const now = realTrend(code, suffix);
  if (now == null) return stored;
  return [...stored, { at: Date.now(), price: now }];
}

/**
 * % de cambio del precio actual frente a la publicación anterior.
 * Devuelve null si no hay referencia previa para esa carta (primera vez, o aún
 * sin un segundo refresco de precios) o si la carta no tiene precio real.
 */
export function getPriceChangePct(code: string, suffix: string = ''): number | null {
  const before = prevPrices[`${code}${suffix}`] ?? prevPrices[code];
  if (before == null || before <= 0) return null;
  const now = realTrend(code, suffix);
  if (now == null) return null;
  return ((now - before) / before) * 100;
}
