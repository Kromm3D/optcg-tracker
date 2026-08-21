// FriendProfileScreen — view a friend's shared collection / wishlist / decks.
// What loads here is gated by the friend's privacy settings + RLS on the server:
// if a resource isn't shared, the query returns nothing and we show a "not
// shared" placeholder. Card metadata is resolved locally from the bundled index
// (CARDS), so only the friend's (code, suffix, count) tuples come over the wire.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FriendProfileScreenProps } from '../navigation';
import { smartGoBack } from '../lib/nav';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { CachedImage } from '../components/CachedImage';
import { SegmentedControl } from '../components/SegmentedControl';
import { PremiumBadge } from '../components/PremiumBadge';
import { useT } from '../lib/i18n';
import { CARDS } from '../data/loadIndex';
import { resolveImageUris } from '../lib/images';
import { getFriendCollection, getFriendDecks, getFriendWishlists, getFriends } from '../lib/friends';
import { getCachedWishlists } from '../lib/wishlists';
import { getOwnedFor } from '../lib/ownedAggregate';
import { matchGiveToFriend, matchReceiveFromFriend, type TradeMatch } from '../lib/tradeMatch';
import {
  acceptOffer,
  applyAcceptedOffer,
  cancelOffer,
  createOffer,
  declineOffer,
  getOffersWith,
  refreshOffers,
  subscribe as subOffers,
  type TradeOffer,
  type TradeOfferItem,
  type TradeSide,
} from '../lib/tradeOffers';
import type { Deck } from '../lib/decks';
import type { CollectionItem, Wishlist } from '../types';

type Tab = 'collection' | 'wishlist' | 'decks' | 'trade';

export function FriendProfileScreen({ route, navigation }: FriendProfileScreenProps) {
  const { userId, username } = route.params;
  const t = useT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('collection');
  // La lista de amigos ya trae `is_premium` (refreshEdges en FriendsScreen);
  // reusarla evita un fetch aparte sólo para la insignia del header.
  const isPremiumFriend = getFriends().some((e) => e.profile.id === userId && e.profile.is_premium);

  const [collection, setCollection] = useState<CollectionItem[] | null>(null);
  const [wishlists, setWishlists] = useState<Wishlist[] | null>(null);
  const [decks, setDecks] = useState<Deck[] | null>(null);

  useEffect(() => {
    if (tab === 'collection' && collection === null) void getFriendCollection(userId).then(setCollection);
    if (tab === 'wishlist' && wishlists === null) void getFriendWishlists(userId).then(setWishlists);
    if (tab === 'decks' && decks === null) void getFriendDecks(userId).then(setDecks);
    // Trade cruza AMBOS lados: la wishlist del amigo × mi colección, y mi
    // wishlist × la colección del amigo. Reusa los fetchers ya existentes.
    if (tab === 'trade') {
      if (collection === null) void getFriendCollection(userId).then(setCollection);
      if (wishlists === null) void getFriendWishlists(userId).then(setWishlists);
    }
  }, [tab, userId, collection, wishlists, decks]);

  const TABS: Array<{ key: Tab; labelKey: 'friend.collection' | 'friend.wishlist' | 'friend.decks' | 'friend.trade' }> = [
    { key: 'collection', labelKey: 'friend.collection' },
    { key: 'wishlist', labelKey: 'friend.wishlist' },
    { key: 'decks', labelKey: 'friend.decks' },
    { key: 'trade', labelKey: 'friend.trade' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => smartGoBack(navigation)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          style={({ pressed }) => [s.backBtn, pressed && pressedStyle]}
        >
          <Icon name="chevL" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{username}</Text>
        {isPremiumFriend && <PremiumBadge size={18} />}
      </View>

      <View style={s.tabs}>
        <SegmentedControl<Tab>
          segments={TABS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {tab === 'collection' && <CollectionView items={collection} />}
        {tab === 'wishlist' && <WishlistView wishlists={wishlists} />}
        {tab === 'decks' && <DecksView decks={decks} />}
        {tab === 'trade' && (
          <TradeView
            friendCollection={collection}
            friendWishlists={wishlists}
            username={username}
            userId={userId}
          />
        )}
      </ScrollView>
    </View>
  );
}

function NotShared() {
  const t = useT();
  return (
    <View style={s.empty}>
      <Icon name="close" size={28} color={colors.textDim} />
      <Text style={s.emptyTitle}>{t('friend.notShared')}</Text>
      <Text style={s.desc}>{t('friend.notSharedDesc')}</Text>
    </View>
  );
}

function Loading() {
  return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
}

function CollectionView({ items }: { items: CollectionItem[] | null }) {
  const t = useT();
  if (items === null) return <Loading />;
  if (items.length === 0) return <NotShared />;
  const total = items.reduce((acc, i) => acc + i.count, 0);
  return (
    <>
      <Text style={s.summary}>
        {items.length} {t('friend.uniqueCards')} · {total} {t('friend.cards')}
      </Text>
      <View style={s.grid}>
        {items.map((it) => {
          const card = CARDS[it.code];
          const variant = card?.variants.find((v) => v.suffix === it.suffix) ?? card?.variants[0];
          if (!variant) return null;
          const { uri, fallback } = resolveImageUris(variant);
          return (
            <View key={it.key} style={s.cell}>
              <CachedImage uri={uri} fallbackUri={fallback} style={s.img} placeholderBg={colors.surface2} />
              <View style={s.countBadge}>
                <Text style={s.countText}>{it.count}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function WishlistView({ wishlists }: { wishlists: Wishlist[] | null }) {
  const t = useT();
  if (wishlists === null) return <Loading />;
  if (wishlists.length === 0) return <NotShared />;
  return (
    <View style={{ gap: 10 }}>
      {wishlists.map((wl) => (
        <View key={wl.id} style={s.listRow}>
          <Icon name="heart" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.listTitle}>{wl.name}</Text>
            <Text style={s.desc}>{t('friend.wishCount', { n: Object.keys(wl.cards).length })}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function DecksView({ decks }: { decks: Deck[] | null }) {
  const t = useT();
  if (decks === null) return <Loading />;
  if (decks.length === 0) return <NotShared />;
  return (
    <View style={{ gap: 10 }}>
      {decks.map((d) => {
        const total = d.cards.reduce((acc, c) => acc + c.qty, 0);
        const leader = d.leaderId ? CARDS[d.leaderId] : undefined;
        const leaderVar = leader?.variants[0];
        const uris = leaderVar ? resolveImageUris(leaderVar) : null;
        return (
          <View key={d.id} style={s.listRow}>
            {uris ? (
              <CachedImage uri={uris.uri} fallbackUri={uris.fallback} style={s.deckThumb} placeholderBg={colors.surface2} />
            ) : (
              <Icon name="layers" size={18} color={colors.accent} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.listTitle}>{d.name}</Text>
              <Text style={s.desc}>{t('friend.deckCount', { n: total })}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TradeView({
  friendCollection,
  friendWishlists,
  username,
  userId,
}: {
  friendCollection: CollectionItem[] | null;
  friendWishlists: Wishlist[] | null;
  username: string;
  userId: string;
}) {
  const t = useT();
  // Ambos lados deben haber cargado (o resuelto a []); null = aún cargando.
  const give = useMemo<TradeMatch[] | null>(
    () => (friendWishlists === null ? null : matchGiveToFriend(friendWishlists, getOwnedFor)),
    [friendWishlists],
  );
  const receive = useMemo<TradeMatch[] | null>(
    () => (friendCollection === null ? null : matchReceiveFromFriend(getCachedWishlists(), friendCollection)),
    [friendCollection],
  );

  // Selección de la oferta en curso, por lado. La cantidad por defecto es lo
  // máximo que el trato admite: min(lo que hay, lo que se necesita).
  const [picked, setPicked] = useState<Record<TradeSide, Record<string, number>>>({
    give: {},
    receive: {},
  });
  const [sending, setSending] = useState(false);
  const [offers, setOffers] = useState<TradeOffer[]>(() => getOffersWith(userId));

  useEffect(() => {
    void refreshOffers();
    return subOffers(() => setOffers(getOffersWith(userId)));
  }, [userId]);

  const toggle = (side: TradeSide, m: TradeMatch) =>
    setPicked((p) => {
      const next = { ...p[side] };
      if (next[m.code]) delete next[m.code];
      else next[m.code] = Math.max(1, Math.min(m.have, m.need));
      return { ...p, [side]: next };
    });

  const selectedCount =
    Object.keys(picked.give).length + Object.keys(picked.receive).length;

  const send = async () => {
    setSending(true);
    // El sufijo va vacío a propósito: el matching es por código base (un trade
    // es de la carta, no del arte). Concretar la variante es cosa del chat.
    const items: TradeOfferItem[] = [
      ...Object.entries(picked.give).map(([code, qty]) => ({ side: 'give' as const, code, suffix: '', qty })),
      ...Object.entries(picked.receive).map(([code, qty]) => ({ side: 'receive' as const, code, suffix: '', qty })),
    ];
    const res = await createOffer(userId, items);
    setSending(false);
    if (res.ok) setPicked({ give: {}, receive: {} });
    else console.warn('[trade] createOffer failed:', res.error);
  };

  if (give === null || receive === null) return <Loading />;

  // Abiertas: pendientes, o aceptadas que todavía necesitan una acción
  // (aplicar el intercambio cuando las cartas cambien de manos de verdad).
  // Historial: cerradas de cualquier forma — rechazadas, canceladas, o
  // aceptadas y ya aplicadas (el trato se completó, no hay nada más que hacer).
  const openOffers = offers.filter((o) => o.status === 'pending' || (o.status === 'accepted' && !o.appliedAt));
  const historyOffers = offers.filter(
    (o) => o.status === 'declined' || o.status === 'cancelled' || (o.status === 'accepted' && !!o.appliedAt),
  );

  if (give.length === 0 && receive.length === 0 && openOffers.length === 0 && historyOffers.length === 0) {
    return (
      <View style={s.empty}>
        <Icon name="swap" size={28} color={colors.textDim} />
        <Text style={s.emptyTitle}>{t('friend.noTrades')}</Text>
        <Text style={s.desc}>{t('friend.noTradesDesc')}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      {openOffers.map((o) => (
        <OfferCard key={o.id} offer={o} username={username} />
      ))}

      <TradeSection
        title={t('friend.youHaveTheyWant', { name: username })}
        matches={give}
        needLabelKey="friend.tradeTheyNeed"
        haveLabelKey="friend.tradeYouHave"
        picked={picked.give}
        onToggle={(m) => toggle('give', m)}
      />
      <TradeSection
        title={t('friend.theyHaveYouWant', { name: username })}
        matches={receive}
        needLabelKey="friend.tradeYouNeed"
        haveLabelKey="friend.tradeTheyHave"
        picked={picked.receive}
        onToggle={(m) => toggle('receive', m)}
      />

      {selectedCount > 0 ? (
        <Pressable
          onPress={send}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t('trade.propose')}
          style={({ pressed }) => [s.proposeBtn, pressed && pressedStyle, sending && { opacity: 0.6 }]}
        >
          <Icon name="swap" size={17} color={colors.onAccent} />
          <Text style={s.proposeText}>{t('trade.propose', { n: selectedCount })}</Text>
        </Pressable>
      ) : null}

      {historyOffers.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={s.tradeHead}>{t('trade.history')}</Text>
          {/* Más recientes primero — ya vienen ordenadas así desde refreshOffers(). */}
          {historyOffers.map((o) => (
            <HistoryCard key={o.id} offer={o} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Fila de sólo lectura para una oferta cerrada (rechazada/cancelada/aplicada).
 *  Sin botones de acción a propósito: nada que hacer con un trato cerrado. */
function HistoryCard({ offer }: { offer: TradeOffer }) {
  const t = useT();
  const line = (side: TradeSide) =>
    offer.items
      .filter((i) => i.side === side)
      .map((i) => `${i.qty}× ${i.code}`)
      .join(', ') || '—';

  const statusLabel =
    offer.status === 'declined' ? t('trade.statusDeclined')
    : offer.status === 'cancelled' ? t('trade.statusCancelled')
    : t('trade.statusCompleted');

  return (
    <View style={s.historyCard}>
      <View style={s.historyHeadRow}>
        <Text style={s.historyStatus}>{statusLabel}</Text>
        <Text style={s.desc}>{new Date(offer.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text style={s.offerLine}>{t('trade.youGive')}: {line(offer.outgoing ? 'give' : 'receive')}</Text>
      <Text style={s.offerLine}>{t('trade.youGet')}: {line(offer.outgoing ? 'receive' : 'give')}</Text>
    </View>
  );
}

/** Una oferta abierta con este amigo, con las acciones que me correspondan. */
function OfferCard({ offer, username }: { offer: TradeOffer; username: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const line = (side: TradeSide) =>
    offer.items
      .filter((i) => i.side === side)
      .map((i) => `${i.qty}× ${i.code}`)
      .join(', ') || '—';

  return (
    <View style={s.offerCard}>
      <Text style={s.offerTitle}>
        {offer.outgoing ? t('trade.youProposed', { name: username }) : t('trade.theyProposed', { name: username })}
      </Text>
      {/* Siempre en primera persona: "das" / "recibes", nunca los nombres
          crudos de los lados, que se leen al revés según quién mire. */}
      <Text style={s.offerLine}>{t('trade.youGive')}: {line(offer.outgoing ? 'give' : 'receive')}</Text>
      <Text style={s.offerLine}>{t('trade.youGet')}: {line(offer.outgoing ? 'receive' : 'give')}</Text>

      <View style={s.offerActions}>
        {offer.status === 'accepted' && offer.appliedAt ? (
          <Text style={s.offerLine}>{t('trade.applied')}</Text>
        ) : offer.status === 'accepted' ? (
          <Pressable
            onPress={() => run(() => applyAcceptedOffer(offer))}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [s.offerBtn, s.offerBtnPrimary, pressed && pressedStyle]}
          >
            <Text style={[s.offerBtnText, { color: colors.onAccent }]}>{t('trade.applyToCollection')}</Text>
          </Pressable>
        ) : offer.outgoing ? (
          <Pressable
            onPress={() => run(() => cancelOffer(offer.id))}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [s.offerBtn, pressed && pressedStyle]}
          >
            <Text style={s.offerBtnText}>{t('trade.cancel')}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => run(() => declineOffer(offer.id))}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [s.offerBtn, pressed && pressedStyle]}
            >
              <Text style={s.offerBtnText}>{t('trade.decline')}</Text>
            </Pressable>
            <Pressable
              onPress={() => run(() => acceptOffer(offer.id))}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [s.offerBtn, s.offerBtnPrimary, pressed && pressedStyle]}
            >
              <Text style={[s.offerBtnText, { color: colors.onAccent }]}>{t('trade.accept')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function TradeSection({
  title,
  matches,
  needLabelKey,
  haveLabelKey,
  picked,
  onToggle,
}: {
  title: string;
  matches: TradeMatch[];
  needLabelKey: 'friend.tradeTheyNeed' | 'friend.tradeYouNeed';
  haveLabelKey: 'friend.tradeYouHave' | 'friend.tradeTheyHave';
  picked: Record<string, number>;
  onToggle: (m: TradeMatch) => void;
}) {
  const t = useT();
  if (matches.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.tradeHead}>{title} · {matches.length}</Text>
      <View style={s.grid}>
        {matches.map((m) => {
          const card = CARDS[m.code];
          const variant = card?.variants[0];
          if (!variant) return null;
          const { uri, fallback } = resolveImageUris(variant);
          const qty = picked[m.code];
          return (
            <Pressable
              key={m.code}
              style={s.tradeCell}
              onPress={() => onToggle(m)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!qty }}
              accessibilityLabel={m.code}
            >
              <View>
                <CachedImage uri={uri} fallbackUri={fallback} style={s.tradeImg} placeholderBg={colors.surface2} />
                {qty ? (
                  <View style={s.pickBadge}>
                    <Text style={s.pickBadgeText}>×{qty}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.tradeCode} numberOfLines={1}>{m.code}</Text>
              <Text style={s.tradeMeta} numberOfLines={1}>
                {t(haveLabelKey, { n: m.have })} · {t(needLabelKey, { n: m.need })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 26, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  tabs: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
  scroll: { padding: spacing.lg, paddingBottom: 110 },
  summary: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31%', aspectRatio: 5 / 7, position: 'relative' },
  img: { width: '100%', height: '100%', borderRadius: radii.md },
  countBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: { fontSize: 12, fontFamily: fonts.uiBold, color: colors.onAccent },
  tradeHead: { fontSize: 14, fontFamily: fonts.uiBold, color: colors.text },
  tradeCell: { width: '31%' },
  tradeImg: { width: '100%', aspectRatio: 5 / 7, borderRadius: radii.md },
  tradeCode: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 4 },
  tradeMeta: { fontSize: 10, fontFamily: fonts.ui, color: colors.textDim, marginTop: 1 },
  pickBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  pickBadgeText: { fontSize: 10, fontFamily: fonts.uiBold, color: colors.onAccent },
  proposeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 14,
  },
  proposeText: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.onAccent },
  offerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 6,
  },
  offerTitle: { fontSize: 14, fontFamily: fonts.uiBold, color: colors.text },
  offerLine: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  historyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
    opacity: 0.8,
  },
  historyHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyStatus: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  offerBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
  },
  offerBtnPrimary: { backgroundColor: colors.accent },
  offerBtnText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  listTitle: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  deckThumb: { width: 34, height: 48, borderRadius: radii.sm },
  desc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 50 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
});
