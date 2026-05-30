// Browse: search + filtros multi-criterio en sheet modal + sort + grid.

import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BrowseScreenProps } from '../navigation';
import { CARD_LIST } from '../data/loadIndex';
import { colors, fonts, RARITY_ORDER } from '../theme';
import { Icon } from '../components/Icon';
import { CardThumb } from '../components/CardThumb';
import { ColumnsToggle } from '../components/ColumnsToggle';
import { FilterSheet } from '../components/FilterSheet';
import {
  FilterState,
  emptyFilters,
  activeCount,
  matches,
  fuzzyFilter,
} from '../lib/filters';
import { getOwnedFor, subscribe as subOwned } from '../lib/ownedAggregate';
import { getSettings, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';
import type { Card } from '../types';

type SortKey = 'rarity' | 'cost' | 'power' | 'owned' | 'code';

export function BrowseScreen({ navigation }: BrowseScreenProps) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortKey>('code');
  const [columns, setColumnsState] = useState(getSettings().columns);
  const { cardWidth, gap, hPadding } = useCardGrid(columns);
  const [, force] = useState(0);

  useEffect(() => subOwned(() => force((n) => n + 1)), []);
  useEffect(() => subSettings(() => setColumnsState(getSettings().columns)), []);

  const list = useMemo<Card[]>(() => {
    let result = CARD_LIST.filter((c) => matches(c, filters));
    result = fuzzyFilter(result, q);

    if (sort === 'rarity') {
      result = [...result].sort(
        (a, b) =>
          (RARITY_ORDER[b.variants[0]?.rarity?.toUpperCase() ?? ''] ?? 0) -
          (RARITY_ORDER[a.variants[0]?.rarity?.toUpperCase() ?? ''] ?? 0)
      );
    } else if (sort === 'cost') {
      result = [...result].sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99));
    } else if (sort === 'power') {
      result = [...result].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    } else if (sort === 'owned') {
      result = [...result].sort((a, b) => getOwnedFor(b.code) - getOwnedFor(a.code));
    } else {
      result = [...result].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })
      );
    }
    return result.slice(0, 800);
  }, [q, filters, sort]);

  const fcount = activeCount(filters);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.searchWrap}>
        <View style={s.search}>
          <Icon name="search" size={19} color={colors.textDim} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="yellow luffy op15, red OP01-001..."
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={s.searchInput}
          />
          {q ? (
            <Pressable onPress={() => setQ('')}>
              <Icon name="close" size={18} color={colors.textDim} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowFilters(true)}
          style={[s.filterBtn, fcount > 0 && s.filterBtnOn]}
        >
          <Icon
            name="filter"
            size={18}
            color={fcount > 0 ? colors.accent : colors.text}
          />
          {fcount > 0 ? (
            <Text style={s.filterBadge}>{fcount}</Text>
          ) : null}
        </Pressable>
      </View>

      <View style={s.sortRow}>
        <Text style={s.sortCount}>{list.length} cards</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {(
            [
              ['code', 'Code'],
              ['rarity', 'Rar'],
              ['cost', 'Cost'],
              ['power', 'Pow'],
              ['owned', 'Own'],
            ] as [SortKey, string][]
          ).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setSort(k)}
              style={[s.sortBtn, sort === k ? s.sortBtnOn : null]}
            >
              <Text
                style={[
                  s.sortLabel,
                  { color: sort === k ? colors.accent : colors.textDim },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          <ColumnsToggle />
        </View>
      </View>

      <FlatList
        key={`grid-${columns}`}
        data={list}
        keyExtractor={(item) => item.code}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 110, gap: gap + 4 }}
        renderItem={({ item }) => (
          <CardThumb
            card={item}
            owned={getOwnedFor(item.code)}
            compact={columns >= 3}
            onPress={() => navigation.navigate('Detail', { code: item.code })}
            width={cardWidth}
          />
        )}
      />

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingTop: 4,
    gap: 10,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, fontFamily: fonts.ui },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBtnOn: { borderColor: colors.accent },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    color: '#fff',
    fontSize: 10,
    fontFamily: fonts.uiBold,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sortCount: { fontSize: 13, color: colors.textDim, fontFamily: fonts.ui },
  sortBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  sortBtnOn: { backgroundColor: colors.accentDim },
  sortLabel: { fontSize: 12, fontFamily: fonts.uiSemi },
  grid: { paddingHorizontal: 18, paddingBottom: 110 },
  col: { justifyContent: 'space-between', marginBottom: 16 },
});
