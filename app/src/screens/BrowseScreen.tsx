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
  setPrefix,
} from '../lib/filters';
import { getOwnedFor, getVariantOwned, getOwnedVariantCount, subscribe as subOwned } from '../lib/ownedAggregate';
import { getSettings, setShowAlternateArt, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';
import { expandCards } from '../lib/cardDisplay';
import { BulkActionBar, type BulkTarget } from '../components/BulkActionBar';
import { BulkTargetSheet, type BulkSelection } from '../components/BulkTargetSheet';
import type { Card } from '../types';

type SortKey = 'rarity' | 'cost' | 'power' | 'owned' | 'code' | 'set';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

export function BrowseScreen({ navigation }: BrowseScreenProps) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'code', dir: 'asc' });
  const [columns, setColumnsState] = useState(getSettings().columns);
  const { cardWidth, gap, hPadding } = useCardGrid(columns);
  const [, force] = useState(0);

  // Multi-select / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, BulkSelection>>({});
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);
  const selectedList = Object.values(selected);

  const toggleSel = (key: string, code: string, suffix: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { code, suffix };
      return next;
    });
  const clearSel = () => { setSelected({}); setSelectMode(false); };

  useEffect(() => subOwned(() => force((n) => n + 1)), []);
  useEffect(() => subSettings(() => { setColumnsState(getSettings().columns); force((n) => n + 1); }), []);

  // Debounce: retrasa el filtrado 180 ms para no procesar en cada pulsación.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 180);
    return () => clearTimeout(id);
  }, [q]);

  const showAlt = getSettings().showAlternateArt;

  const handleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );

  const list = useMemo<Card[]>(() => {
    let result = CARD_LIST.filter((c) => matches(c, filters));
    result = fuzzyFilter(result, debouncedQ);

    const dir = sort.dir === 'asc' ? 1 : -1;

    if (sort.key === 'rarity') {
      result = [...result].sort(
        (a, b) =>
          dir * (
            (RARITY_ORDER[a.variants[0]?.rarity?.toUpperCase() ?? ''] ?? 0) -
            (RARITY_ORDER[b.variants[0]?.rarity?.toUpperCase() ?? ''] ?? 0)
          )
      );
    } else if (sort.key === 'cost') {
      result = [...result].sort((a, b) => dir * ((a.cost ?? 99) - (b.cost ?? 99)));
    } else if (sort.key === 'power') {
      result = [...result].sort((a, b) => dir * ((a.power ?? 0) - (b.power ?? 0)));
    } else if (sort.key === 'owned') {
      result = [...result].sort((a, b) => dir * (getOwnedFor(a.code) - getOwnedFor(b.code)));
    } else if (sort.key === 'set') {
      result = [...result].sort((a, b) => {
        const sp = dir * setPrefix(a.code).localeCompare(setPrefix(b.code), undefined, { numeric: true });
        return sp !== 0 ? sp : dir * a.code.localeCompare(b.code, undefined, { numeric: true });
      });
    } else {
      result = [...result].sort((a, b) =>
        dir * a.code.localeCompare(b.code, undefined, { numeric: true })
      );
    }
    return result;
  }, [debouncedQ, filters, sort]);

  // Expand into display tiles (one per variant when Show Alternate Art is on).
  const entries = useMemo(() => expandCards(list), [list, showAlt]);

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
        <Pressable
          onPress={() => { if (selectMode) clearSel(); else setSelectMode(true); }}
          style={[s.filterBtn, selectMode && s.filterBtnOn]}
        >
          <Icon name={selectMode ? 'close' : 'check'} size={18} color={selectMode ? colors.accent : colors.text} />
        </Pressable>
      </View>

      <View style={s.sortRow}>
        <Text style={s.sortCount}>{list.length} cards</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Pressable
            style={[s.sortBtn, showAlt && s.sortBtnOn]}
            onPress={() => setShowAlternateArt(!showAlt)}
          >
            <Text style={[s.sortLabel, { color: showAlt ? colors.accent : colors.textDim }]}>
              Parallels
            </Text>
          </Pressable>
          {(
            [
              ['code', 'Code'],
              ['set', 'Set'],
              ['rarity', 'Rar'],
              ['cost', 'Cost'],
              ['power', 'Pow'],
              ['owned', 'Own'],
            ] as [SortKey, string][]
          ).map(([k, label]) => {
            const active = sort.key === k;
            return (
              <Pressable
                key={k}
                onPress={() => handleSort(k)}
                style={[s.sortBtn, active ? s.sortBtnOn : null]}
              >
                <Text style={[s.sortLabel, { color: active ? colors.accent : colors.textDim }]}>
                  {label}
                </Text>
                {active && (
                  <Icon
                    name={sort.dir === 'asc' ? 'arrowUp' : 'arrowDn'}
                    size={10}
                    color={colors.accent}
                  />
                )}
              </Pressable>
            );
          })}
          <ColumnsToggle />
        </View>
      </View>

      <FlatList
        key={`grid-${columns}`}
        data={entries}
        keyExtractor={(item) => item.key}
        numColumns={columns}
        extraData={{ selectMode, selected }}
        columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: selectMode ? 180 : 110, gap: gap + 4 }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => {
          const src = item.variant.set_source;
          const cardSet = setPrefix(item.card.code);
          const totalOwned = getOwnedFor(item.card.code);
          const varOwned = getVariantOwned(item.card.code, item.variant.suffix);
          return (
            <CardThumb
              card={item.card}
              // En modo showAlt pasamos la variante concreta; en modo normal
              // no forzamos ninguna para que CardThumb muestre la más rara poseída.
              variant={showAlt ? item.variant : undefined}
              owned={showAlt ? varOwned : totalOwned}
              dimmed={showAlt ? varOwned === 0 : totalOwned === 0}
              multiArt={!showAlt && getOwnedVariantCount(item.card.code) >= 2}
              sourceSet={showAlt && src && src !== cardSet ? src : undefined}
              selected={selectMode && !!selected[item.key]}
              compact={columns >= 3}
              quickActions={!selectMode}
              showFooter
              onPress={() =>
                selectMode
                  ? toggleSel(item.key, item.card.code, item.variant.suffix)
                  : navigation.navigate('Detail', { code: item.card.code, suffix: item.variant?.suffix })
              }
              width={cardWidth}
            />
          );
        }}
      />

      {selectMode && (
        <BulkActionBar count={selectedList.length} onClear={clearSel} onPick={setBulkTarget} bottomGap={84} />
      )}

      <BulkTargetSheet
        visible={bulkTarget !== null}
        target={bulkTarget}
        selections={selectedList}
        onClose={() => setBulkTarget(null)}
        onDone={() => { setBulkTarget(null); clearSel(); }}
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
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  sortBtnOn: { backgroundColor: colors.accentDim },
  sortLabel: { fontSize: 12, fontFamily: fonts.uiSemi },
  grid: { paddingHorizontal: 18, paddingBottom: 110 },
  col: { justifyContent: 'space-between', marginBottom: 16 },
});
