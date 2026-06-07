// Capa de autenticación sobre Supabase Auth.
//
// Sigue el mismo idiom que el resto de stores (collection/settings…): una caché
// en memoria + un Set de listeners con subscribe(). La sesión real la persiste
// el cliente de Supabase en AsyncStorage; aquí solo mantenemos un espejo síncrono
// para que la UI pueda leer el estado sin async y re-renderizar con subscribe().
//
// La sincronización de datos NO vive aquí (ver lib/sync.ts) para evitar imports
// circulares: sync.ts se suscribe a onAuthChange() y reacciona a login/logout.

import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseEnabled, supabase } from './supabase';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

let session: Session | null = null;
let profile: Profile | null = null;
let ready = false; // true tras la primera lectura de getSession()
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

// Hidratación inicial + suscripción a cambios del cliente de Supabase.
if (isSupabaseEnabled() && supabase) {
  supabase.auth.getSession().then(({ data }) => {
    session = data.session ?? null;
    ready = true;
    notify();
    if (session) void refreshProfile();
  });
  supabase.auth.onAuthStateChange((_event, next) => {
    session = next ?? null;
    if (!session) profile = null;
    notify();
    if (session) void refreshProfile();
  });
}

/** Sesión actual (síncrona desde la caché). null si no hay login / sin backend. */
export function getSession(): Session | null {
  return session;
}

/** Usuario actual o null. */
export function getUser(): User | null {
  return session?.user ?? null;
}

/** ¿Hay sesión iniciada? */
export function isSignedIn(): boolean {
  return session !== null;
}

/** ¿Ya se intentó leer la sesión persistida al arrancar? (evita parpadeos). */
export function isAuthReady(): boolean {
  return ready;
}

/** Perfil público del usuario actual (username/avatar). null si no cargado. */
export function getProfile(): Profile | null {
  return profile;
}

/** Re-lee el perfil del usuario actual desde la tabla `profiles`. */
export async function refreshProfile(): Promise<Profile | null> {
  if (!supabase || !session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) {
    console.warn('[auth] refreshProfile error:', error.message);
    return profile;
  }
  profile = (data as Profile) ?? null;
  notify();
  return profile;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** true si el registro requiere confirmación por email antes de poder entrar. */
  needsConfirmation?: boolean;
}

/** Registro con email + contraseña. `username` se guarda en user_metadata y lo
 *  recoge el trigger handle_new_user para crear el perfil. */
export async function signUp(
  email: string,
  password: string,
  username: string,
): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'backend-disabled' };
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) return { ok: false, error: error.message };
  // Si la confirmación por email está activada, no hay sesión todavía.
  return { ok: true, needsConfirmation: !data.session };
}

/** Inicio de sesión con email + contraseña. */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'backend-disabled' };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Cierra la sesión. Los datos locales NO se borran (siguen disponibles offline). */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Actualiza username / display_name / avatar del perfil del usuario actual. */
export async function updateProfile(
  patch: Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url'>>,
): Promise<AuthResult> {
  if (!supabase || !session) return { ok: false, error: 'not-signed-in' };
  const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
  if (error) return { ok: false, error: error.message };
  await refreshProfile();
  return { ok: true };
}

/** Suscríbete a cambios de sesión/perfil; devuelve un unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Alias semántico para sync.ts: reacciona a login/logout. */
export function onAuthChange(listener: () => void): () => void {
  return subscribe(listener);
}
