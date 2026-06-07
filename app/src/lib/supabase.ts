// Cliente de Supabase para la app.
//
// El backend es OPCIONAL (la app es local-first). Si no hay credenciales en
// config.ts (`SUPABASE_ENABLED === false`), `supabase` es null y toda la lógica
// de cuenta/sync/amigos debe degradar elegantemente (mismo contrato que el resto
// de features nativas: comprobar disponibilidad antes de usar).
//
// La sesión se persiste en AsyncStorage (la misma que usa el resto de la app),
// con auto-refresh del token. `detectSessionInUrl` se desactiva: no hay flujo de
// redirect OAuth por URL en React Native.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_ENABLED, SUPABASE_URL } from '../config';

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
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
