// Cliente de Supabase para la app.
//
// El backend es OPCIONAL (la app es local-first). Si no hay credenciales en
// config.ts (`SUPABASE_ENABLED === false`), `supabase` es null y toda la lógica
// de cuenta/sync/amigos debe degradar elegantemente (mismo contrato que el resto
// de features nativas: comprobar disponibilidad antes de usar).
//
// La sesión (JWT + refresh token) se persiste vía expo-secure-store (Keychain en
// iOS, Keystore-backed EncryptedSharedPreferences en Android) en vez de
// AsyncStorage, para no dejar el token en texto plano en disco. Patrón oficial
// de Supabase para React Native. `detectSessionInUrl` se desactiva: no hay flujo
// de redirect OAuth por URL en React Native.
//
// **En web se cae a AsyncStorage a propósito.** `expo-secure-store` no tiene
// implementación web (su `ExpoSecureStore.web.js` exporta `{}`), así que llamarlo
// desde el bundle web reventaría el login. El navegador no ofrece un equivalente
// al Keychain de todas formas, y AsyncStorage era lo que ya se usaba antes en
// todas las plataformas: web no queda peor que como estaba, y nativo —que es lo
// que se publica en Play Store— sí gana el almacenamiento cifrado.

import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_ENABLED, SUPABASE_URL } from '../config';

const SessionStorageAdapter =
  Platform.OS === 'web'
    ? AsyncStorage
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: SessionStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/** ¿Está configurado el backend? Gatea la UI de cuenta/sync/amigos. */
export function isSupabaseEnabled(): boolean {
  return supabase !== null;
}

/** Lanza si el backend no está configurado. Úsalo en helpers que lo requieren. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase no está configurado (revisa SUPABASE_URL / SUPABASE_ANON_KEY en config.ts).');
  }
  return supabase;
}
