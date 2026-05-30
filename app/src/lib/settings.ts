// Preferencias de UI persistidas. Por ahora solo el numero de columnas
// del grid, pero esta pensado para crecer (tema, sort por defecto, etc.).

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'optcg.settings.v1';

export type Settings = {
  columns: 2 | 3 | 4 | 5;
};

const DEFAULTS: Settings = {
  columns: 3,
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

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Hidratacion inicial
read();
