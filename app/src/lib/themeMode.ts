// Modo de tema (forma de Zeus): 'light' = Regular (nube blanca), 'dark' =
// Thundercloud (nube negra, rayos). Vive en su PROPIA clave de AsyncStorage,
// separada de `settings.ts`, porque debe poder leerse ANTES de que `App.tsx`
// (y por tanto `theme.ts`) se evalúe — ver `index.js`, que hace un require()
// diferido de `App` tras leer esta clave, para que los `StyleSheet.create`
// estáticos de cada pantalla arranquen ya con el color correcto. Cambiar de
// modo requiere reiniciar la app (ver SettingsScreen) porque esos
// StyleSheet.create solo se evalúan una vez, al importar el módulo.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'optcg.themeMode.v1';
const DEFAULT_MODE: ThemeMode = 'dark';

export async function getStoredThemeMode(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}
