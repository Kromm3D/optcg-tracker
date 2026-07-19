// Matching de trades entre dos usuarios: cruza wishlists con colecciones para
// encontrar intercambios posibles. Funciones PURAS (sin red ni estado): reciben
// los datos ya cargados y devuelven los solapamientos, así son fáciles de testear
// y las fuentes (local vs. amigo por RLS) las decide el caller.
//
// El emparejamiento es por CÓDIGO BASE, no por variante exacta: un trade va de la
// carta, no del arte concreto (si quieres OP01-016 y el otro tiene cualquier
// versión de OP01-016, hay match). Se agrega por código base sumando cantidades.

import type { CollectionItem, Wishlist } from '../types';

export interface TradeMatch {
  /** Código base de la carta (p.ej. "OP01-016"). */
  code: string;
  /** Copias que el lado que la QUIERE necesita (sumadas entre sus wishlists). */
  need: number;
  /** Copias que el lado que la TIENE posee (sumadas entre variantes). */
  have: number;
}

/** Suma las copias necesitadas por código base a lo largo de varias wishlists. */
function neededByCode(wishlists: Wishlist[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const wl of wishlists) {
    for (const wc of Object.values(wl.cards)) {
      m.set(wc.code, (m.get(wc.code) ?? 0) + wc.needed);
    }
  }
  return m;
}

/** Suma las copias en propiedad por código base de una colección. */
function ownedByCode(collection: CollectionItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of collection) {
    if (it.count > 0) m.set(it.code, (m.get(it.code) ?? 0) + it.count);
  }
  return m;
}

/**
 * Cartas que el DUEÑO de `wants` necesita y que el DUEÑO de `ownedFor` posee.
 * Genérica en ambos sentidos del trade — el caller elige qué lado es cada uno.
 *
 * @param wants     wishlists del lado que quiere cartas
 * @param ownedFor  función código→copias en propiedad del lado que las tiene
 */
export function matchWantsAgainstOwned(
  wants: Wishlist[],
  ownedFor: (code: string) => number,
): TradeMatch[] {
  const out: TradeMatch[] = [];
  for (const [code, need] of neededByCode(wants)) {
    const have = ownedFor(code);
    if (have > 0) out.push({ code, need, have });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/**
 * "Puedo darle": cartas de la wishlist del amigo que YO tengo en mi colección.
 * @param friendWishlists  wishlists (compartidas) del amigo
 * @param myOwnedFor       mi getOwnedFor local
 */
export function matchGiveToFriend(
  friendWishlists: Wishlist[],
  myOwnedFor: (code: string) => number,
): TradeMatch[] {
  return matchWantsAgainstOwned(friendWishlists, myOwnedFor);
}

/**
 * "Puede darme": cartas de MI wishlist que el amigo tiene en su colección.
 * @param myWishlists       mis wishlists locales
 * @param friendCollection  colección (compartida) del amigo
 */
export function matchReceiveFromFriend(
  myWishlists: Wishlist[],
  friendCollection: CollectionItem[],
): TradeMatch[] {
  const owned = ownedByCode(friendCollection);
  return matchWantsAgainstOwned(myWishlists, (code) => owned.get(code) ?? 0);
}
