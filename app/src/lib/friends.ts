// Sistema de amigos (prototipo) sobre Supabase.
//
// Modelo: una fila por relación en `friendships` (requester/addressee/status).
// La visibilidad de la colección/wishlist/decks de cada usuario la imponen las
// políticas RLS del servidor (ver supabase/migrations/0001_init.sql): aquí solo
// pedimos los datos; si no tenemos permiso el servidor devuelve filas vacías.
//
// Caché en memoria de la lista de amigos + Set de listeners con subscribe(),
// igual que el resto de stores. Las lecturas de datos de un amigo concreto
// (colección/wishlist/decks) son fetchers async sin caché (se piden al abrir el
// perfil).

import { supabase } from './supabase';
import { getUser } from './auth';
import type {
  CollectionItem,
  FriendEdge,
  FriendProfile,
  PrivacySettings,
  Wishlist,
} from '../types';
import type { Deck } from './decks';

let edgesCache: FriendEdge[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedEdges(): FriendEdge[] {
  return edgesCache;
}

export interface FriendsResult {
  ok: boolean;
  error?: string;
}

const toMs = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);

/** Busca usuarios por username (prefijo, case-insensitive), excluyéndote a ti. */
export async function searchUsers(query: string): Promise<FriendProfile[]> {
  const q = query.trim();
  if (!supabase || q.length < 2) return [];
  const me = getUser()?.id;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', `${q}%`)
    .limit(20);
  if (error) {
    console.warn('[friends] searchUsers error:', error.message);
    return [];
  }
  return (data as FriendProfile[]).filter((p) => p.id !== me);
}

/** Refresca la lista de relaciones (pending + accepted) del usuario actual. */
export async function refreshEdges(): Promise<FriendEdge[]> {
  const me = getUser()?.id;
  if (!supabase || !me) {
    edgesCache = [];
    notify();
    return edgesCache;
  }
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  if (error) {
    console.warn('[friends] refreshEdges error:', error.message);
    return edgesCache;
  }

  const rows = data ?? [];
  const otherIds = rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
  const profileMap = new Map<string, FriendProfile>();
  if (otherIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', otherIds);
    for (const p of (profs as FriendProfile[]) ?? []) profileMap.set(p.id, p);
  }

  edgesCache = rows
    .map((r) => {
      const outgoing = r.requester_id === me;
      const otherId = outgoing ? r.addressee_id : r.requester_id;
      const profile = profileMap.get(otherId);
      if (!profile) return null;
      return { id: r.id, status: r.status, outgoing, profile } as FriendEdge;
    })
    .filter((e): e is FriendEdge => e !== null);
  notify();
  return edgesCache;
}

/** Amigos confirmados. */
export function getFriends(): FriendEdge[] {
  return edgesCache.filter((e) => e.status === 'accepted');
}

/** Solicitudes entrantes pendientes (que debo aceptar/rechazar). */
export function getIncomingRequests(): FriendEdge[] {
  return edgesCache.filter((e) => e.status === 'pending' && !e.outgoing);
}

/** Solicitudes salientes pendientes (enviadas por mí). */
export function getOutgoingRequests(): FriendEdge[] {
  return edgesCache.filter((e) => e.status === 'pending' && e.outgoing);
}

/** Envía una solicitud de amistad a otro usuario. */
export async function sendRequest(addresseeId: string): Promise<FriendsResult> {
  const me = getUser()?.id;
  if (!supabase || !me) return { ok: false, error: 'not-signed-in' };
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: me, addressee_id: addresseeId, status: 'pending' });
  if (error) return { ok: false, error: error.message };
  await refreshEdges();
  return { ok: true };
}

/** Acepta una solicitud entrante. */
export async function acceptRequest(edgeId: string): Promise<FriendsResult> {
  if (!supabase) return { ok: false, error: 'backend-disabled' };
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', edgeId);
  if (error) return { ok: false, error: error.message };
  await refreshEdges();
  return { ok: true };
}

/** Rechaza una solicitud o elimina una amistad (borra la fila). */
export async function removeEdge(edgeId: string): Promise<FriendsResult> {
  if (!supabase) return { ok: false, error: 'backend-disabled' };
  const { error } = await supabase.from('friendships').delete().eq('id', edgeId);
  if (error) return { ok: false, error: error.message };
  await refreshEdges();
  return { ok: true };
}

// ─── Lectura de datos de un amigo (RLS-gated) ───────────────────────────────

/** Colección de un amigo (vacío si no compartida / sin permiso). */
export async function getFriendCollection(userId: string): Promise<CollectionItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('collection_items')
    .select('code, suffix, count')
    .eq('user_id', userId);
  if (error) {
    console.warn('[friends] getFriendCollection error:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ key: `${r.code}${r.suffix}`, code: r.code, suffix: r.suffix, count: r.count }));
}

/** Wishlists de un amigo (vacío si no compartidas / sin permiso). */
export async function getFriendWishlists(userId: string): Promise<Wishlist[]> {
  if (!supabase) return [];
  const { data: wls, error } = await supabase
    .from('wishlists')
    .select('id, name, created_at, updated_at')
    .eq('user_id', userId);
  if (error || !wls?.length) return [];
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
  return wls.map((w) => ({
    id: w.id,
    name: w.name,
    cards: byWl.get(w.id) ?? {},
    createdAt: toMs(w.created_at),
    updatedAt: toMs(w.updated_at),
  }));
}

/** Decks de un amigo (vacío si no compartidos / sin permiso). */
export async function getFriendDecks(userId: string): Promise<Deck[]> {
  if (!supabase) return [];
  const { data: decks, error } = await supabase
    .from('decks')
    .select('id, name, leader_id, created_at, updated_at')
    .eq('user_id', userId);
  if (error || !decks?.length) return [];
  const ids = decks.map((d) => d.id);
  const { data: cards } = await supabase.from('deck_cards').select('deck_id, code, qty').in('deck_id', ids);
  const byDeck = new Map<string, Deck['cards']>();
  for (const c of cards ?? []) {
    const arr = byDeck.get(c.deck_id) ?? [];
    arr.push({ code: c.code, qty: c.qty });
    byDeck.set(c.deck_id, arr);
  }
  return decks.map((d) => ({
    id: d.id,
    name: d.name,
    leaderId: d.leader_id ?? undefined,
    cards: byDeck.get(d.id) ?? [],
    createdAt: toMs(d.created_at),
    updatedAt: toMs(d.updated_at),
  }));
}

// ─── Privacidad propia ──────────────────────────────────────────────────────

/** Lee las preferencias de privacidad del usuario actual. */
export async function getPrivacy(): Promise<PrivacySettings | null> {
  const me = getUser()?.id;
  if (!supabase || !me) return null;
  const { data, error } = await supabase
    .from('privacy_settings')
    .select('collection, wishlist, decks')
    .eq('user_id', me)
    .maybeSingle();
  if (error) {
    console.warn('[friends] getPrivacy error:', error.message);
    return null;
  }
  return (data as PrivacySettings) ?? { collection: 'friends', wishlist: 'friends', decks: 'friends' };
}

/** Actualiza una preferencia de privacidad concreta. */
export async function setPrivacy(patch: Partial<PrivacySettings>): Promise<FriendsResult> {
  const me = getUser()?.id;
  if (!supabase || !me) return { ok: false, error: 'not-signed-in' };
  const { error } = await supabase.from('privacy_settings').update(patch).eq('user_id', me);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
