// tradeOffers.ts — proponer, aceptar y rechazar intercambios con un amigo.
//
// Complementa lib/tradeMatch.ts: aquél *encuentra* solapamientos (lógica pura,
// sin red), éste *acuerda* uno concreto contra Supabase.
//
// Al contrario que colección/wishlists/decks, las ofertas NO se replican en
// AsyncStorage ni pasan por lib/sync: una negociación entre dos personas no
// tiene sentido offline (no puedes aceptar sin conexión algo que el otro
// podría haber cancelado). Si no hay backend o no hay sesión, la función
// devuelve un error en vez de fingir que funcionó.
//
// Ver supabase/migrations/0003_trade_offers.sql para el modelo y las políticas.

import { supabase } from './supabase';
import { getUser } from './auth';
import type { FriendProfile } from '../types';

/** Lado de una línea de la oferta, desde el punto de vista del proponente. */
export type TradeSide = 'give' | 'receive';

export type TradeOfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface TradeOfferItem {
  side: TradeSide;
  code: string;
  suffix: string;
  qty: number;
}

export interface TradeOffer {
  id: string;
  status: TradeOfferStatus;
  note: string | null;
  createdAt: number;
  /** true si la oferta la mandé yo (soy `from_user`). */
  outgoing: boolean;
  /** Perfil de la otra parte, sea quien sea de los dos. */
  counterparty: FriendProfile | null;
  items: TradeOfferItem[];
}

export interface TradeOfferResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const toMs = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);

let cache: TradeOffer[] = [];
const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot síncrono para renders. Vacío hasta el primer refreshOffers(). */
export function getCachedOffers(): TradeOffer[] {
  return cache;
}

/** Ofertas pendientes que me han enviado — las que piden una acción mía. */
export function getIncomingPending(): TradeOffer[] {
  return cache.filter((o) => !o.outgoing && o.status === 'pending');
}

/** Ofertas (de cualquier estado) intercambiadas con un amigo concreto. */
export function getOffersWith(userId: string): TradeOffer[] {
  return cache.filter((o) => o.counterparty?.id === userId);
}

/**
 * Recarga todas mis ofertas (enviadas y recibidas) con sus líneas.
 *
 * Tres consultas en vez de un join anidado: PostgREST puede embeber relaciones,
 * pero mezclarlo con RLS sobre dos tablas produce errores mucho más difíciles
 * de leer cuando algo falla. Con este volumen (decenas de filas) no compensa.
 */
export async function refreshOffers(): Promise<TradeOffer[]> {
  const me = getUser()?.id;
  if (!supabase || !me) {
    cache = [];
    listeners.forEach((l) => l());
    return cache;
  }

  const { data: offers, error } = await supabase
    .from('trade_offers')
    .select('id, from_user, to_user, status, note, created_at')
    .or(`from_user.eq.${me},to_user.eq.${me}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[tradeOffers] refresh error:', error.message);
    return cache;
  }
  const rows = offers ?? [];
  if (!rows.length) {
    cache = [];
    listeners.forEach((l) => l());
    return cache;
  }

  const { data: items } = await supabase
    .from('trade_offer_items')
    .select('offer_id, side, code, suffix, qty')
    .in('offer_id', rows.map((o) => o.id));

  const byOffer = new Map<string, TradeOfferItem[]>();
  for (const it of items ?? []) {
    const arr = byOffer.get(it.offer_id) ?? [];
    arr.push({ side: it.side as TradeSide, code: it.code, suffix: it.suffix, qty: it.qty });
    byOffer.set(it.offer_id, arr);
  }

  const otherIds = [...new Set(rows.map((o) => (o.from_user === me ? o.to_user : o.from_user)))];
  const profiles = new Map<string, FriendProfile>();
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherIds);
  for (const p of (profs as FriendProfile[]) ?? []) profiles.set(p.id, p);

  cache = rows.map((o) => {
    const outgoing = o.from_user === me;
    return {
      id: o.id,
      status: o.status as TradeOfferStatus,
      note: o.note,
      createdAt: toMs(o.created_at),
      outgoing,
      counterparty: profiles.get(outgoing ? o.to_user : o.from_user) ?? null,
      items: byOffer.get(o.id) ?? [],
    };
  });
  listeners.forEach((l) => l());
  return cache;
}

/**
 * Crea una oferta con sus líneas.
 *
 * La cabecera y las líneas son dos inserts: si el segundo falla, se borra la
 * cabecera antes de devolver el error. Una oferta vacía es peor que ninguna —
 * el otro vería "te propongo un intercambio" sin cartas dentro.
 */
export async function createOffer(
  toUserId: string,
  items: TradeOfferItem[],
  note?: string,
): Promise<TradeOfferResult> {
  const me = getUser()?.id;
  if (!supabase || !me) return { ok: false, error: 'not-signed-in' };
  if (!items.length) return { ok: false, error: 'empty-offer' };

  const { data, error } = await supabase
    .from('trade_offers')
    .insert({ from_user: me, to_user: toUserId, note: note?.trim() || null })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert-failed' };

  const { error: itemsError } = await supabase.from('trade_offer_items').insert(
    items.map((i) => ({
      offer_id: data.id,
      side: i.side,
      code: i.code,
      suffix: i.suffix,
      qty: Math.max(1, Math.min(99, Math.round(i.qty))),
    })),
  );
  if (itemsError) {
    await supabase.from('trade_offers').delete().eq('id', data.id);
    return { ok: false, error: itemsError.message };
  }

  await refreshOffers();
  return { ok: true, id: data.id };
}

/** Cambia el estado de una oferta. El servidor valida quién puede hacer qué
 *  (ver `trade_offer_guard`), así que un error aquí es informativo, no una
 *  brecha: no hay forma de aceptar tu propia oferta desde el cliente. */
async function transition(offerId: string, status: TradeOfferStatus): Promise<TradeOfferResult> {
  if (!supabase) return { ok: false, error: 'backend-disabled' };
  const { error } = await supabase.from('trade_offers').update({ status }).eq('id', offerId);
  if (error) return { ok: false, error: error.message };
  await refreshOffers();
  return { ok: true };
}

/** El destinatario acepta. No mueve cartas por su cuenta: el intercambio es
 *  físico y puede tardar días en materializarse (correo, quedada). Ajustar la
 *  colección es un paso aparte y explícito — ver `applyAcceptedOffer`. */
export const acceptOffer = (id: string) => transition(id, 'accepted');
export const declineOffer = (id: string) => transition(id, 'declined');
export const cancelOffer = (id: string) => transition(id, 'cancelled');

/**
 * Aplica un intercambio ya materializado a tu colección local: resta lo que
 * entregaste y suma lo que recibiste.
 *
 * Deliberadamente NO se llama al aceptar. Aceptar es "trato hecho"; las cartas
 * cambian de manos después. Llamarlo antes dejaría al usuario con una
 * colección que no coincide con su carpeta, que es justo el fallo que una app
 * de colección no puede permitirse.
 *
 * Los lados se interpretan desde el punto de vista del proponente, así que el
 * signo se invierte para el destinatario.
 */
export async function applyAcceptedOffer(offer: TradeOffer): Promise<void> {
  const { adjust } = await import('./collection');
  for (const item of offer.items) {
    const iAmGivingIt = offer.outgoing ? item.side === 'give' : item.side === 'receive';
    await adjust(item.code, item.suffix, iAmGivingIt ? -item.qty : item.qty);
  }
}
