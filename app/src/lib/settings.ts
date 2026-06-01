// Preferencias de UI persistidas. Por ahora solo el numero de columnas
// del grid, pero esta pensado para crecer (tema, sort por defecto, etc.).

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'optcg.settings.v1';

export type Language = 'en' | 'es';

export type WishlistDefaultVariant = 'normal' | 'parallel';

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
};

const DEFAULTS: Settings = {
  columns: 3,
  language: 'en',
  countParallels: false,
  playsetSize: 4,
  wishlistDefaultVariant: 'normal',
  showAlternateArt: false,
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

async function write(next: Settings): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[settings] error escribiendo storage:', e);
  }
  listeners.forEach((l) => l());
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
