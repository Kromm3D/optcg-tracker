// Preferencias de UI persistidas. Por ahora solo el numero de columnas
// del grid, pero esta pensado para crecer (tema, sort por defecto, etc.).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyLocalChange } from './syncBus';

const STORAGE_KEY = 'optcg.settings.v1';

export type Language = 'en' | 'es';

export type WishlistDefaultVariant = 'normal' | 'parallel';

/** Ventana temporal seleccionada en el módulo de valor del vault (Home). */
export type ValueTimeframe = '7d' | '30d' | 'all';

/** Divisa de presentación. El catálogo se scrapea en EUR: el resto son
 *  conversiones con tasa fija (ver lib/currency.ts). */
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'JPY';

// ─── Perfil de usuario ──────────────────────────────────────────────────────
//
// La app ha crecido hasta cubrir desde "cuántas cartas tengo" hasta gradeo y
// P&L de cartera. Eso no le sirve a la misma persona: al jugador y al
// coleccionista medio, la mitad de esa interfaz sólo les estorba.
//
// El perfil es un **preset sobre interruptores sueltos**, no un modo cerrado:
// elegir "Sencillo" apaga un conjunto, pero cualquiera de ellos se puede
// encender por separado desde Ajustes. Así nadie queda encerrado ni tiene que
// adivinar qué se está perdiendo.
//
// **Regla firme: el perfil oculta INTERFAZ, nunca datos.** En modo Sencillo la
// app sigue guardando el histórico de precios y lo que haya guardado antes; lo
// único que cambia es qué se enseña. Si mañana pasas a Completo, tienes
// historial desde el primer día en vez de una gráfica vacía. Lo contrario
// sería una trampa silenciosa.

/** `null` = todavía no se ha preguntado (primer arranque). */
export type UserProfile = 'simple' | 'full';

/** Las piezas de interfaz que el perfil puede apagar. */
export type FeatureKey =
  /** Estado físico de la carta (NM/LP/…) en la hoja de detalles de copia. */
  | 'condition'
  /** Gradeo profesional (PSA/BGS) en esa misma hoja. */
  | 'grading'
  /** Coste de adquisición y la fila de ganancia/pérdida en Home. */
  | 'costBasis'
  /** Gráfica de histórico de precio en la ficha de carta. */
  | 'priceChart'
  /** Precio objetivo por carta de wishlist + banner de avisos en Home. */
  | 'priceAlerts';

const PROFILE_PRESETS: Record<UserProfile, Record<FeatureKey, boolean>> = {
  simple: {
    condition: false,
    grading: false,
    costBasis: false,
    priceChart: false,
    priceAlerts: false,
  },
  full: {
    condition: true,
    grading: true,
    costBasis: true,
    priceChart: true,
    priceAlerts: true,
  },
};

/** Perfil que se aplica a quien se salta el onboarding. El público objetivo es
 *  el jugador/coleccionista medio, así que por defecto se enseña menos. */
export const DEFAULT_PROFILE: UserProfile = 'simple';

export type Settings = {
  columns: 2 | 3 | 4 | 5;
  /** Idioma de la UI. */
  language: Language;
  /** Si true, un set solo cuenta como completo cuando se poseen TODAS las
   *  variantes (incluidos parallels) de cada carta. */
  countParallels: boolean;
  /** Tamano del playset: copias que el usuario quiere conservar antes de que
   *  el excedente vaya al binder de Trade. */
  playsetSize: number;
  /** Variante por defecto al añadir cartas a una wishlist. */
  wishlistDefaultVariant: WishlistDefaultVariant;
  /** Si true, los grids muestran cada variante (parallels/alt-art) como su
   *  propia carta/slot. Si false, solo se muestra el arte normal por defecto. */
  showAlternateArt: boolean;
  /** true si el usuario ha completado la descarga offline de todas las imágenes. */
  imagesDownloaded: boolean;
  /** Ventana temporal del módulo de valor del vault en Home. */
  valueTimeframe: ValueTimeframe;
  /** Divisa en la que se muestran todos los importes. */
  currency: CurrencyCode;
  /** Perfil elegido. `null` = aún no se ha preguntado → sale el onboarding. */
  profile: UserProfile | null;
  /** Interruptores sueltos que ganan al preset del perfil. Sólo contiene las
   *  claves que el usuario ha tocado a mano: el resto sigue al perfil, así que
   *  cambiar de perfil mueve todo lo que no se haya personalizado. */
  featureOverrides: Partial<Record<FeatureKey, boolean>>;
  /** Si true, el valor del vault descuenta por el estado de las cartas
   *  (una LP vale menos que una NM). Si false, todo se valora como NM. */
  valueByCondition: boolean;
  /** Timestamp (ms) del último cambio. Usado por la sync LWW. */
  updatedAt?: number;
};

const DEFAULTS: Settings = {
  columns: 3,
  language: 'en',
  countParallels: false,
  playsetSize: 4,
  wishlistDefaultVariant: 'normal',
  showAlternateArt: false,
  imagesDownloaded: false,
  valueTimeframe: '7d',
  currency: 'EUR',
  valueByCondition: true,
  profile: null,
  featureOverrides: {},
};

let cache: Settings | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<Settings> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch (e) {
    console.warn('[settings] error leyendo storage:', e);
    cache = { ...DEFAULTS };
  }
  return cache;
}

async function write(next: Settings, emit = true): Promise<void> {
  const stamped = emit ? { ...next, updatedAt: Date.now() } : next;
  cache = stamped;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
  } catch (e) {
    console.warn('[settings] error escribiendo storage:', e);
  }
  listeners.forEach((l) => l());
  if (emit) notifyLocalChange('settings');
}

/** Aplica settings venidos de la nube (sync). No re-emite al bus. */
export async function applyFromSync(next: Settings): Promise<void> {
  await write({ ...DEFAULTS, ...next }, false);
}

/** Snapshot síncrono actual para la sync (o null si aún no hidratado). */
export function getCachedSettings(): Settings | null {
  return cache;
}

/** Espera a que los settings estén leídos de disco.
 *
 *  `subscribe()` sólo notifica en las escrituras, así que quien necesite el
 *  valor *real* (y no los defaults) antes de pintar — el onboarding, que
 *  compara `profile` contra null — tiene que esperar a esto. Con `getSettings()`
 *  a secas vería el default null y le enseñaría el onboarding a alguien que ya
 *  lo respondió. */
export function loadSettings(): Promise<Settings> {
  return read();
}

/** Devuelve los settings actuales en cache. Si no hay cache, devuelve los defaults
 *  y lanza un read() en background para hidratar el cache. */
export function getSettings(): Settings {
  if (cache) return cache;
  // Hidratar en background; el caller debe usar subscribe() para refrescar.
  read();
  return DEFAULTS;
}

export async function setColumns(n: 2 | 3 | 4 | 5): Promise<void> {
  const current = await read();
  await write({ ...current, columns: n });
}

export async function setLanguage(lang: Language): Promise<void> {
  const current = await read();
  await write({ ...current, language: lang });
}

export async function setCountParallels(v: boolean): Promise<void> {
  const current = await read();
  await write({ ...current, countParallels: v });
}

export async function setPlaysetSize(n: number): Promise<void> {
  const current = await read();
  await write({ ...current, playsetSize: Math.max(0, Math.floor(n)) });
}

export async function setWishlistDefaultVariant(v: WishlistDefaultVariant): Promise<void> {
  const current = await read();
  await write({ ...current, wishlistDefaultVariant: v });
}

export async function setShowAlternateArt(v: boolean): Promise<void> {
  const current = await read();
  await write({ ...current, showAlternateArt: v });
}

export async function setImagesDownloaded(v: boolean): Promise<void> {
  const current = await read();
  await write({ ...current, imagesDownloaded: v });
}

export async function setValueTimeframe(v: ValueTimeframe): Promise<void> {
  const current = await read();
  await write({ ...current, valueTimeframe: v });
}

/**
 * ¿Debe verse esta pieza de interfaz?
 *
 * Precedencia: interruptor suelto del usuario → preset del perfil. Antes de
 * elegir perfil se usa DEFAULT_PROFILE, para que la app tenga un aspecto
 * coherente incluso mientras el onboarding está en pantalla.
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  const s = getSettings();
  const override = s.featureOverrides?.[key];
  if (override !== undefined) return override;
  return PROFILE_PRESETS[s.profile ?? DEFAULT_PROFILE][key];
}

/** Cambia de perfil. **Limpia los interruptores sueltos**: si no, elegir un
 *  perfil nuevo dejaría restos del anterior y el resultado no se parecería a
 *  lo que el usuario acaba de escoger. */
export async function setProfile(profile: UserProfile): Promise<void> {
  const current = await read();
  await write({ ...current, profile, featureOverrides: {} });
}

/** Enciende o apaga una pieza suelta, por encima del preset. */
export async function setFeatureOverride(key: FeatureKey, value: boolean): Promise<void> {
  const current = await read();
  await write({ ...current, featureOverrides: { ...current.featureOverrides, [key]: value } });
}

/** Devuelve una pieza al valor que le toca por perfil. */
export async function clearFeatureOverride(key: FeatureKey): Promise<void> {
  const current = await read();
  const next = { ...current.featureOverrides };
  delete next[key];
  await write({ ...current, featureOverrides: next });
}

export async function setCurrency(v: CurrencyCode): Promise<void> {
  const current = await read();
  await write({ ...current, currency: v });
}

export async function setValueByCondition(v: boolean): Promise<void> {
  const current = await read();
  await write({ ...current, valueByCondition: v });
}

/** Helper: pick the right variant suffix from a card based on the user's default setting. */
export function getDefaultWishlistSuffix(variants: Array<{ suffix: string; label: string }>): string {
  const s = getSettings().wishlistDefaultVariant;
  if (s === 'parallel') {
    // First variant whose label suggests it's a parallel (not 'Normal')
    const parallel = variants.find((v) => v.label && !v.label.toLowerCase().includes('normal') && v.suffix !== '');
    if (parallel) return parallel.suffix;
  }
  // Fall back: variant with empty suffix, else first one
  return variants.find((v) => v.suffix === '')?.suffix ?? variants[0]?.suffix ?? '';
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Hidratacion inicial
read();
