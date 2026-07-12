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

const KEY = 'optcg.priceHistory.v1';

type Store = {
  curGen: string;                  // `generated` de la publicación actual
  cur: Record<string, number>;     // snapshot de la publicación actual
  prevGen: string;                 // `generated` de la publicación anterior
  prev: Record<string, number>;    // snapshot anterior (referencia del delta)
};

// Referencia previa en memoria (clave variante -> precio). Vacío hasta init().
let prevPrices: Record<string, number> = {};
let initialized = false;

/** Carga/rota el snapshot de precios. Llamar una vez al arrancar (App.tsx). */
export async function initPriceHistory(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const gen = PRICES_META.generated || '';
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const stored: Store | null = raw ? JSON.parse(raw) : null;

    if (!stored) {
      // Primera vez: fijamos la línea base, sin referencia previa todavía.
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify({ curGen: gen, cur: snapshotRealPrices(), prevGen: '', prev: {} }),
      );
      prevPrices = {};
    } else if (stored.curGen !== gen) {
      // Nueva publicación de precios → la "actual" anterior pasa a ser "previa".
      prevPrices = stored.cur || {};
      await AsyncStorage.setItem(
        KEY,
        JSON.stringify({ curGen: gen, cur: snapshotRealPrices(), prevGen: stored.curGen, prev: prevPrices }),
      );
    } else {
      // Misma publicación: conservamos la referencia previa ya guardada.
      prevPrices = stored.prev || {};
    }
  } catch {
    // AsyncStorage no disponible (p.ej. SSR/web sin storage): sin deltas.
    prevPrices = {};
  }
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
