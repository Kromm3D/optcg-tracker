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
import { useT } from '../lib/i18n';
import { CARDS } from '../data/loadIndex';
import { resolveImageUris } from '../lib/images';
import { getFriendCollection, getFriendDecks, getFriendWishlists } from '../lib/friends';
import { getCachedWishlists } from '../lib/wishlists';
import { getOwnedFor } from '../lib/ownedAggregate';
import { matchGiveToFriend, matchReceiveFromFriend, type TradeMatch } from '../lib/tradeMatch';
import type { Deck } from '../lib/decks';
import type { CollectionItem, Wishlist } from '../types';

type Tab = 'collection' | 'wishlist' | 'decks' | 'trade';

export function FriendProfileScreen({ route, navigation }: FriendProfileScreenProps) {
  const { userId, username } = route.params;
  const t = useT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('collection');

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
          <TradeView friendCollection={collection} friendWishlists={wishlists} username={username} />
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
}: {
  friendCollection: CollectionItem[] | null;
  friendWishlists: Wishlist[] | null;
  username: string;
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

  if (give === null || receive === null) return <Loading />;

  if (give.length === 0 && receive.length === 0) {
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
      <TradeSection
        title={t('friend.youHaveTheyWant', { name: username })}
        matches={give}
        needLabelKey="friend.tradeTheyNeed"
        haveLabelKey="friend.tradeYouHave"
      />
      <TradeSection
        title={t('friend.theyHaveYouWant', { name: username })}
        matches={receive}
        needLabelKey="friend.tradeYouNeed"
        haveLabelKey="friend.tradeTheyHave"
      />
    </View>
  );
}

function TradeSection({
  title,
  matches,
  needLabelKey,
  haveLabelKey,
}: {
  title: string;
  matches: TradeMatch[];
  needLabelKey: 'friend.tradeTheyNeed' | 'friend.tradeYouNeed';
  haveLabelKey: 'friend.tradeYouHave' | 'friend.tradeTheyHave';
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
          return (
            <View key={m.code} style={s.tradeCell}>
              <CachedImage uri={uri} fallbackUri={fallback} style={s.tradeImg} placeholderBg={colors.surface2} />
              <Text style={s.tradeCode} numberOfLines={1}>{m.code}</Text>
              <Text style={s.tradeMeta} numberOfLines={1}>
                {t(haveLabelKey, { n: m.have })} · {t(needLabelKey, { n: m.need })}
              </Text>
            </View>
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
