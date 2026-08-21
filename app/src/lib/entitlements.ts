// Entitlements: qué ha desbloqueado el usuario (premium), separado de qué
// prefiere ver (perfil Sencillo/Completo en settings.ts).
//
// **Por qué es un eje aparte y no un `FeatureKey` más.** `isFeatureEnabled()` de
// settings.ts responde a "¿quiere el usuario ver esto?" — y el usuario alterna
// esos interruptores libremente desde Ajustes. Un entitlement responde a "¿ha
// pagado por esto?", y por definición NO puede alternarlo. Meterlos en la misma
// estructura convertiría el paywall en un interruptor de Ajustes.
//
// **Regla firme, heredada del perfil: esto capa FUNCIONES, nunca DATOS.** Si una
// suscripción expira, la colección, los decks y el histórico siguen intactos y
// visibles; lo único que se congela es la función de coste recurrente (subir a
// la nube, recibir push). Borrar o esconder datos ya guardados por dejar de
// pagar es una trampa silenciosa y se gana reseñas de 1★ con razón.
//
// **Esto NO es un control de seguridad.** El cliente es manipulable: cualquiera
// con el APK puede forzar `hasEntitlement()` a true. Sirve para la UI y para el
// usuario honesto. Todo lo que cueste dinero de verdad al backend (sync, push,
// analytics) tiene que validarse ADEMÁS en servidor — RLS o Edge Function
// mirando el entitlement espejado, nunca fiándose de lo que diga la app.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'optcg.entitlements.v1';

/**
 * Los tres productos del plan de monetización (ver ToDo.md):
 *
 * - `removeAds` — compra única, quita el banner.
 * - `unlocks`   — compra única. Todo lo de coste marginal cero: temas, pack de
 *                 imágenes offline, export, slots ilimitados, binders múltiples,
 *                 bulk scan sin tope, insignia de perfil.
 * - `cloud`     — SUSCRIPCIÓN. Sólo lo que le cuesta dinero recurrente al
 *                 desarrollador: sync/backup en Supabase, analytics de precio,
 *                 notificaciones push.
 *
 * La separación importa: si algo de `unlocks` acabara detrás de la suscripción
 * estaríamos cobrando alquiler por algo que no nos cuesta nada mantener.
 */
export type Entitlement = 'removeAds' | 'unlocks' | 'cloud';

/** De dónde viene el entitlement. La store es la única fuente de verdad real. */
export type EntitlementSource =
  /** Recibo de Google Play (vía RevenueCat). Lo único válido en producción. */
  | 'store'
  /** Espejo cacheado de Supabase, para arrancar offline sin consultar la store. */
  | 'cache'
  /** Forzado a mano en desarrollo. Ignorado si `__DEV__` es false. */
  | 'devOverride';

export type EntitlementState = {
  granted: Entitlement[];
  source: EntitlementSource;
  /** Epoch ms de la última confirmación contra la store. 0 = nunca. */
  verifiedAt: number;
};

const DEFAULTS: EntitlementState = {
  granted: [],
  source: 'cache',
  verifiedAt: 0,
};

let cache: EntitlementState | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<EntitlementState> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<EntitlementState>) } : { ...DEFAULTS };
  } catch (e) {
    console.warn('[entitlements] error leyendo storage:', e);
    cache = { ...DEFAULTS };
  }
  return cache;
}

// Ojo: a diferencia de settings.ts, aquí NO se llama a `notifyLocalChange()`.
// Los entitlements no son datos del usuario que viajen por la sync local-first:
// van en sentido único (store → Supabase → dispositivo). Si los metiéramos en el
// bus de sync, un cliente modificado podría empujar entitlements falsos al
// servidor y propagárselos a sus otros dispositivos.
async function write(next: EntitlementState): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[entitlements] error escribiendo storage:', e);
  }
  listeners.forEach((l) => l());
}

/** Espera a que los entitlements estén leídos de disco. Igual que
 *  `loadSettings()`: quien decida qué pintar antes del primer render (el
 *  paywall, el banner de ads) tiene que esperar a esto en vez de fiarse del
 *  default vacío, o le enseñaría el paywall a alguien que ya ha pagado. */
export function loadEntitlements(): Promise<EntitlementState> {
  return read();
}

/** Estado actual en cache. Si no hay, devuelve los defaults e hidrata en
 *  background (el caller debe usar `subscribe()` para refrescar). */
export function getEntitlements(): EntitlementState {
  if (cache) return cache;
  read();
  return DEFAULTS;
}

/**
 * Aplica lo que diga la store / el espejo de Supabase. Es el único camino por
 * el que un entitlement debería entrar en producción.
 */
export async function applyEntitlements(
  granted: Entitlement[],
  source: EntitlementSource = 'store',
): Promise<void> {
  await write({ granted: [...new Set(granted)], source, verifiedAt: Date.now() });
}

/** ¿Tiene el usuario este desbloqueo? */
export function hasEntitlement(key: Entitlement): boolean {
  return getEntitlements().granted.includes(key);
}

/** Azúcar para la UI: ¿hay algo pagado? Útil para la insignia de perfil. */
export function isPremium(): boolean {
  return getEntitlements().granted.length > 0;
}

// ─── Límites del tier gratis ────────────────────────────────────────────────
//
// Un único sitio donde viven los topes, para no dispersar números mágicos por
// las pantallas. `null` = sin límite.
//
// Lo que NO aparece aquí es deliberado (ver "Guardrails" en ToDo.md): el tamaño
// de la colección, el escaneo unitario y los amigos no se capan nunca. La
// colección es la promesa central del tracker, el escaneo es on-device y no
// cuesta nada, y el grafo social sólo crece si es gratis.

export type LimitedResource =
  /** Decks activos simultáneos. Archivar sigue siendo gratis e ilimitado. */
  | 'decks'
  /** Wishlists guardadas. */
  | 'wishlists'
  /** Layouts/órdenes de binder guardados. */
  | 'binderLayouts'
  /** Cartas por sesión de bulk scan. El escaneo de una carta suelta no se capa. */
  | 'bulkScanPerSession';

export const FREE_LIMITS: Record<LimitedResource, number> = {
  decks: 5,
  wishlists: 1,
  binderLayouts: 1,
  bulkScanPerSession: 20,
};

/**
 * Tope actual para este recurso, o `null` si es ilimitado.
 *
 * Todos los límites de recursos cuelgan de `unlocks` (compra única): son
 * comodidad de organización, no infraestructura. Cobrar suscripción por tener
 * más de un deck sería alquilar algo que no nos cuesta nada.
 */
export function getLimit(resource: LimitedResource): number | null {
  return hasEntitlement('unlocks') ? null : FREE_LIMITS[resource];
}

/**
 * ¿Cabe uno más? `current` es cuántos hay ya.
 *
 * Pensado para llamarse ANTES de abrir el formulario de creación, no después:
 * dejar al usuario nombrar un deck y luego decirle que no cabe es peor que
 * enseñarle el candado de entrada.
 */
export function canAddMore(resource: LimitedResource, current: number): boolean {
  const limit = getLimit(resource);
  return limit === null || current < limit;
}

// ─── Desarrollo ─────────────────────────────────────────────────────────────

/**
 * Enciende/apaga entitlements a mano para probar el paywall sin pasar por la
 * store. **No-op si `__DEV__` es false**, para que no quede una puerta trasera
 * en el build de release aunque alguien deje la llamada puesta.
 */
export async function setDevEntitlements(granted: Entitlement[]): Promise<void> {
  if (!__DEV__) {
    console.warn('[entitlements] setDevEntitlements ignorado fuera de __DEV__');
    return;
  }
  await write({ granted: [...new Set(granted)], source: 'devOverride', verifiedAt: 0 });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Hook: tope actual para `resource`, reactivo a cambios de entitlement.
 *
 * Envuelve el load+subscribe para que cada pantalla que gatea algo no tenga
 * que repetir el mismo `useState`+`useEffect` (esto ya se usa en 5 sitios
 * distintos: decks y las 4 vías de crear wishlist).
 */
/**
 * Hook: ¿tiene el usuario `key`?, reactivo a cambios de entitlement.
 * Igual que `useLimit()` pero para features binarias (histórico de precio,
 * alertas, sync) en vez de topes numéricos.
 */
export function useHasEntitlement(key: Entitlement): boolean {
  const [granted, setGranted] = useState(() => hasEntitlement(key));
  useEffect(() => {
    const sync = () => setGranted(hasEntitlement(key));
    loadEntitlements().then(sync);
    return subscribe(sync);
  }, [key]);
  return granted;
}

export function useLimit(resource: LimitedResource): number | null {
  const [limit, setLimit] = useState<number | null>(() => getLimit(resource));
  useEffect(() => {
    const sync = () => setLimit(getLimit(resource));
    loadEntitlements().then(sync);
    return subscribe(sync);
  }, [resource]);
  return limit;
}
