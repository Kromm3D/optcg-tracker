// publicWishlist.ts — leer la wishlist de alguien por su nombre de usuario,
// sin sesión ni amistad. Mismo patrón que publicBinder.ts (RLS ya abre estas
// lecturas al rol `anon` cuando `privacy_settings.wishlist = 'public'` — ver
// políticas `wishlists_select_anon`/`wishlist_cards_select_anon`), pero para
// wishlists en vez de colección.
//
// A diferencia del binder (compartible gratis para cualquiera), compartir la
// wishlist es parte del paquete `unlocks` (ver ToDo.md §3) — el gate vive en
// el lado del DUEÑO (sólo puede poner su wishlist en 'public' si tiene
// `unlocks`, ver AccountScreen), no aquí: quien mira un enlace ya publicado
// no necesita ningún entitlement, igual que el binder público.

import { supabase } from './supabase';
import { PUBLIC_WEB_BASE } from '../config';
import type { FriendProfile, Wishlist } from '../types';

export interface PublicWishlist {
  profile: FriendProfile;
  wishlists: Wishlist[];
}

const toMs = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);

/** URL canónica de la wishlist pública de un usuario. */
export function publicWishlistUrl(username: string): string {
  return `${PUBLIC_WEB_BASE}/u/${encodeURIComponent(username)}/wishlist`;
}

export async function fetchPublicWishlist(username: string): Promise<PublicWishlist | null> {
  if (!supabase) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', username)
    .maybeSingle();
  if (error || !profile) return null;

  const { data: wls } = await supabase
    .from('wishlists')
    .select('id, name, created_at, updated_at')
    .eq('user_id', profile.id);

  // Perfil visible pero wishlist no pública: RLS devuelve cero filas — se
  // trata igual que "nada que enseñar" (mismo criterio que publicBinder.ts).
  if (!wls?.length) return null;

  const ids = wls.map((w) => w.id);
  const { data: cards } = await supabase
    .from('wishlist_cards')
    .select('wishlist_id, code, suffix, needed, added_at')
    .in('wishlist_id', ids);

  const byWl = new Map<string, Wishlist['cards']>();
  for (const c of cards ?? []) {
    const m = byWl.get(c.wishlist_id) ?? {};
    m[`${c.code}${c.suffix}`] = { code: c.code, suffix: c.suffix, needed: c.needed, addedAt: toMs(c.added_at) };
    byWl.set(c.wishlist_id, m);
  }

  return {
    profile: profile as FriendProfile,
    wishlists: wls.map((w) => ({
      id: w.id,
      name: w.name,
      cards: byWl.get(w.id) ?? {},
      createdAt: toMs(w.created_at),
      updatedAt: toMs(w.updated_at),
    })),
  };
}
