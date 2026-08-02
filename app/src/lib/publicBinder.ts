// publicBinder.ts — leer el binder de alguien por su nombre de usuario, sin
// tener cuenta ni ser su amigo.
//
// Es el mismo dato que sirve `lib/friends.ts`, pero por una puerta distinta:
// allí el permiso viene de una amistad aceptada; aquí, de que el dueño haya
// puesto ese recurso en 'public'. La migración 0004 abrió esas lecturas al rol
// `anon`, así que este módulo funciona con la sesión que haya — incluida
// ninguna.
//
// Un `null` de `fetchPublicBinder` significa "no hay nada público que ver":
// puede ser un usuario que no existe o uno que no comparte. Se devuelven
// iguales a propósito — distinguirlos convertiría el enlace en un oráculo para
// averiguar qué nombres de usuario están registrados.

import { supabase } from './supabase';
import { PUBLIC_WEB_BASE } from '../config';
import type { CollectionItem, FriendProfile } from '../types';

export interface PublicBinder {
  profile: FriendProfile;
  collection: CollectionItem[];
}

/** URL canónica del binder público de un usuario. El dominio vive en
 *  config.ts, junto al resto de configuración de despliegue. */
export function publicBinderUrl(username: string): string {
  return `${PUBLIC_WEB_BASE}/u/${encodeURIComponent(username)}`;
}

export async function fetchPublicBinder(username: string): Promise<PublicBinder | null> {
  if (!supabase) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', username)
    .maybeSingle();
  if (error || !profile) return null;

  const { data: items } = await supabase
    .from('collection_items')
    .select('code, suffix, count')
    .eq('user_id', profile.id)
    // Las lápidas de borrado (count 0) no son cartas — ver B-17 en AGENTS.md.
    .gt('count', 0);

  // Perfil visible pero colección no pública: RLS devuelve cero filas. Se
  // trata como "nada que enseñar" en vez de como un binder vacío, que
  // insinuaría falsamente que la persona no tiene cartas.
  if (!items?.length) return null;

  return {
    profile: profile as FriendProfile,
    collection: items.map((r) => ({
      key: `${r.code}${r.suffix}`,
      code: r.code,
      suffix: r.suffix,
      count: r.count,
    })),
  };
}
