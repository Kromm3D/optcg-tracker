// priceAlerts.ts — "avísame si esta carta baja de X".
//
// Es la contrapartida natural de la wishlist: el usuario ya declaró qué quiere;
// esto añade a qué precio le interesa. Sin ello, la única forma de cazar una
// bajada es abrir la app y comparar a mano.
//
// **Notificaciones push**: `expo-notifications` NO está instalado (añadirlo
// obliga a un prebuild nativo). El módulo se carga de forma perezosa con un
// guard `isNotificationsAvailable()`, el mismo contrato que lib/ocr y
// lib/shareImage: si el paquete no está, las alertas siguen funcionando pero
// se ven **dentro de la app** (banner en Home) en vez de en la barra de
// estado. Instalar el paquete y hacer prebuild activa el push sin tocar nada
// más aquí.
//
// Los precios objetivo se guardan en EUR (divisa base del catálogo), igual que
// el coste de adquisición: la divisa de presentación es una preferencia y no
// debe quedar horneada en los datos.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CARDS } from '../data/loadIndex';
import { getPrice, hasRealPrice } from './prices';

const STORAGE_KEY = 'optcg.priceAlerts.v1';

export interface PriceAlert {
  code: string;
  suffix: string;
  /** Umbral en EUR. Salta cuando el precio de mercado cae a este valor o menos. */
  targetEur: number;
  createdAt: number;
  /**
   * Última vez que se avisó, para no repetir el aviso en cada arranque
   * mientras el precio siga bajo. `undefined` = nunca notificada.
   */
  notifiedAt?: number;
}

type AlertMap = Record<string, PriceAlert>;

let cache: AlertMap | null = null;
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const keyOf = (code: string, suffix: string) => `${code}${suffix}`;

async function read(): Promise<AlertMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as AlertMap) : {};
  } catch (e) {
    console.warn('[priceAlerts] read error:', e);
    cache = {};
  }
  return cache;
}

async function write(map: AlertMap): Promise<void> {
  cache = map;
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[priceAlerts] write error:', e);
  }
}

/** Snapshot síncrono para renders. */
export function getCachedAlerts(): PriceAlert[] {
  return Object.values(cache ?? {});
}

export function getAlertSync(code: string, suffix: string): PriceAlert | null {
  return cache?.[keyOf(code, suffix)] ?? null;
}

/** Crea o actualiza una alerta. Un objetivo ≤ 0 la elimina. */
export async function setAlert(code: string, suffix: string, targetEur: number): Promise<void> {
  const map = { ...(await read()) };
  const key = keyOf(code, suffix);
  if (targetEur <= 0) delete map[key];
  else {
    map[key] = {
      code,
      suffix,
      targetEur,
      createdAt: map[key]?.createdAt ?? Date.now(),
      // Cambiar el objetivo reabre la alerta: si el usuario lo sube por encima
      // del precio actual, quiere que le vuelvan a avisar.
      notifiedAt: undefined,
    };
  }
  await write(map);
}

export async function removeAlert(code: string, suffix: string): Promise<void> {
  const map = { ...(await read()) };
  delete map[keyOf(code, suffix)];
  await write(map);
}

export interface TriggeredAlert extends PriceAlert {
  /** Precio de mercado que hizo saltar la alerta, en EUR. */
  currentEur: number;
  name: string;
}

/**
 * Alertas cuyo precio de mercado está en el objetivo o por debajo.
 *
 * Se exigen precios **reales** (`hasRealPrice`): la estimación por rareza es
 * un número inventado para rellenar huecos y hacer saltar una alerta de compra
 * con él sería mentirle al usuario sobre una oportunidad que no existe.
 */
export function getTriggeredAlerts(): TriggeredAlert[] {
  const out: TriggeredAlert[] = [];
  for (const alert of getCachedAlerts()) {
    const card = CARDS[alert.code];
    if (!card || !hasRealPrice(card, alert.suffix)) continue;
    const current = getPrice(card, alert.suffix);
    if (current <= alert.targetEur) {
      out.push({ ...alert, currentEur: current, name: card.name });
    }
  }
  return out.sort((a, b) => a.currentEur - b.currentEur);
}

/** Marca alertas como ya avisadas para que no repitan en el próximo arranque. */
export async function markNotified(keys: Array<{ code: string; suffix: string }>): Promise<void> {
  const map = { ...(await read()) };
  const now = Date.now();
  for (const { code, suffix } of keys) {
    const k = keyOf(code, suffix);
    if (map[k]) map[k] = { ...map[k], notifiedAt: now };
  }
  await write(map);
}

// ─── Notificaciones del sistema (opcionales) ────────────────────────────────

type NotificationsModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  scheduleNotificationAsync: (input: unknown) => Promise<string>;
};

let notifModule: NotificationsModule | null | undefined;

function loadNotifications(): NotificationsModule | null {
  if (notifModule !== undefined) return notifModule;
  try {
    notifModule = require('expo-notifications') as NotificationsModule;
  } catch {
    notifModule = null;
  }
  return notifModule;
}

/** ¿Se puede notificar fuera de la app? False en Expo Go / sin el paquete. */
export function isNotificationsAvailable(): boolean {
  return loadNotifications() != null;
}

/**
 * Comprueba las alertas y avisa por el sistema si se puede.
 *
 * Devuelve siempre las alertas disparadas — incluidas las ya notificadas antes
 * — para que la UI pueda enseñarlas dentro de la app. Lo que sí filtra es a
 * quién se le manda una notificación nueva.
 */
export async function checkAlerts(): Promise<TriggeredAlert[]> {
  await read();
  const triggered = getTriggeredAlerts();
  const fresh = triggered.filter((a) => a.notifiedAt == null);
  if (!fresh.length) return triggered;

  const notifications = loadNotifications();
  if (notifications) {
    try {
      const { granted } = await notifications.requestPermissionsAsync();
      if (granted) {
        for (const a of fresh) {
          await notifications.scheduleNotificationAsync({
            content: {
              title: a.name,
              body: `${a.code}${a.suffix} — €${a.currentEur.toFixed(2)}`,
            },
            trigger: null, // inmediata
          });
        }
      }
    } catch (e) {
      console.warn('[priceAlerts] notify error:', e);
    }
  }

  // Se marcan como avisadas aunque no haya paquete de notificaciones: el
  // banner in-app cumple la misma función y repetirlo cada arranque es ruido.
  await markNotified(fresh);
  return triggered;
}

// Hidratación inicial
read();
