// Sugerencias de match agregadas: en vez de tener que abrir el perfil de cada
// amigo y mirar su pestaña Trade uno a uno, esto recorre TODOS los amigos
// confirmados de golpe y devuelve con quién hay solapamiento. Reusa
// exactamente el mismo matching puro de tradeMatch.ts (por código base) y los
// mismos fetchers de friends.ts que ya usa FriendProfileScreen — sólo
// paraleliza la consulta a cada amigo y agrega el resultado.

import { getFriendCollection, getFriendWishlists, getFriends } from './friends';
import { getCachedWishlists } from './wishlists';
import { getOwnedFor } from './ownedAggregate';
import { matchGiveToFriend, matchReceiveFromFriend, type TradeMatch } from './tradeMatch';

export type FriendMatchSummary = {
  userId: string;
  username: string;
  /** Cartas de la wishlist del amigo que yo tengo. */
  give: TradeMatch[];
  /** Cartas de mi wishlist que el amigo tiene. */
  receive: TradeMatch[];
};

/**
 * Recorre los amigos confirmados y calcula, para cada uno, los mismos "doy" /
 * "recibo" que ya se ven en FriendProfileScreen → Trade. Descarta amigos sin
 * ningún solapamiento y ordena por nº total de matches descendente (los más
 * prometedores primero).
 */
export async function getAllFriendMatches(): Promise<FriendMatchSummary[]> {
  const friends = getFriends();
  const myWishlists = getCachedWishlists();

  const results = await Promise.all(
    friends.map(async (e): Promise<FriendMatchSummary> => {
      const [friendCollection, friendWishlists] = await Promise.all([
        getFriendCollection(e.profile.id),
        getFriendWishlists(e.profile.id),
      ]);
      return {
        userId: e.profile.id,
        username: e.profile.username,
        give: matchGiveToFriend(friendWishlists, getOwnedFor),
        receive: matchReceiveFromFriend(myWishlists, friendCollection),
      };
    }),
  );

  return results
    .filter((r) => r.give.length + r.receive.length > 0)
    .sort((a, b) => (b.give.length + b.receive.length) - (a.give.length + a.receive.length));
}
