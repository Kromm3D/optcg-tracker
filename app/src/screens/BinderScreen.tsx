// Binder: tabs internas Collection / Wishlist.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BinderScreenProps } from '../navigation';
import { colors, fonts } from '../theme';
import { CARDS } from '../data/loadIndex';
import { CardThumb } from '../components/CardThumb';
import { ColumnsToggle } from '../components/ColumnsToggle';
import { getOwnedFor, subscribe as subOwned } from '../lib/ownedAggregate';
import { listWishlist, subscribe as subWishlist } from '../lib/wishlist';
import { getSettings, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';
import type { Card } from '../types';

type Tab = 'owned' | 'wishlist';

export function BinderScreen({ navigation }: BinderScreenProps) {
  const [tab, setTab] = useState<Tab>('owned');
  const [, force] = useState(0);
  const [wishCodes, setWishCodes] = useState<string[]>([]);
  const [columns, setColumnsState] = useState(getSettings().columns);
  const { cardWidth, gap, hPadding } = useCardGrid(columns);

  const refreshWish = useCallback(() => {
    listWishlist().then((items) => setWishCodes(items.map((i) => i.code)));
  }, []);

  useEffect(() => {
    refreshWish();
    const unsubO = subOwned(() => force((n) => n + 1));
    const unsubW = subWishlist(refreshWish);
    const unsubS = subSettings(() => setColumnsState(getSettings().columns));
    return () => {
      unsubO();
      unsubW();
      unsubS();
    };
  }, [refreshWish]);

  const [showAll, setShowAll] = useState(false);

  const cards = useMemo<Card[]>(() => {
    if (tab === 'owned') {
      const base = showAll
        ? Object.values(CARDS)
        : Object.values(CARDS).filter((c) => getOwnedFor(c.code) > 0);
      return base.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }
    return wishCodes
      .map((code) => CARDS[code])
      .filter((c): c is Card => !!c)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [tab, wishCodes, showAll]);

  const totalUnits = useMemo(
    () =>
      tab === 'owned'
        ? cards.reduce((acc, c) => acc + getOwnedFor(c.code), 0)
        : cards.length,
    [tab, cards]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.tabBar}>
        <Pressable
          style={[s.tab, tab === 'owned' && s.tabOn]}
          onPress={() => setTab('owned')}
        >
          <Text style={[s.tabLabel, tab === 'owned' && s.tabLabelOn]}>Collection</Text>
        </Pressable>
        <Pressable
          style={[s.tab, tab === 'wishlist' && s.tabOn]}
          onPress={() => setTab('wishlist')}
        >
          <Text style={[s.tabLabel, tab === 'wishlist' && s.tabLabelOn]}>Wishlist</Text>
        </Pressable>
      </View>

      <View style={s.metaRow}>
        <Text style={s.meta}>
          {cards.length} {tab === 'owned' ? 'unique cards' : 'wishes'} ·{' '}
          {totalUnits} {tab === 'owned' ? 'units' : 'pending'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {tab === 'owned' && (
            <Pressable
              style={[s.showAllBtn, showAll && s.showAllBtnOn]}
              onPress={() => setShowAll((v) => !v)}
            >
              <Text style={[s.showAllText, showAll && s.showAllTextOn]}>
                {showAll ? 'Owned only' : 'Show all'}
              </Text>
            </Pressable>
          )}
          <ColumnsToggle />
        </View>
      </View>

      {cards.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>
            {tab === 'owned' ? 'Your binder is empty' : 'Wishlist empty'}
          </Text>
          <Text style={s.emptyBody}>
            {tab === 'owned'
              ? 'Busca una carta y pulsa + en una variante para anyadirla.'
              : 'En el detalle de una carta usa el corazon para anyadirla a tu wishlist.'}
          </Text>
        </View>
      ) : (
        <FlatList
          key={`grid-${columns}`}
          data={cards}
          keyExtractor={(c) => c.code}
          numColumns={columns}
          columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 110, gap: gap + 4 }}
          renderItem={({ item }) => (
            <CardThumb
              card={item}
              owned={getOwnedFor(item.code)}
              compact={columns >= 3}
              dimmed={showAll && getOwnedFor(item.code) === 0}
              onPress={() => navigation.navigate('Detail', { code: item.code })}
              width={cardWidth}
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginTop: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabOn: { backgroundColor: colors.accentDim },
  tabLabel: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  tabLabelOn: { color: colors.accent },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  meta: { fontSize: 12, color: colors.textDim, fontFamily: fonts.ui },
  grid: { paddingHorizontal: 18, paddingBottom: 110 },
  col: { justifyContent: 'space-between', marginBottom: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fonts.display,
    color: colors.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: colors.textMut,
    textAlign: 'center',
  },
  showAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  showAllBtnOn: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  showAllText: {
    fontSize: 11,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
  },
  showAllTextOn: { color: colors.accent },
});
