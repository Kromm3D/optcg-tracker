// Browse: search + filtros multi-criterio en sheet modal + sort + grid.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BrowseScreenProps } from '../navigation';
import { CARD_LIST } from '../data/loadIndex';
import { colors, fonts, pressedStyle, HIT_SLOP } from '../theme';
import { useT } from '../lib/i18n';
import type { TKey } from '../i18n/en';
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
import { sortCards, type SortKey } from '../lib/cardQuery';
import { getPrice } from '../lib/prices';
import { getPriceChangePct } from '../lib/priceHistory';
import { adjust } from '../lib/collection';
import { getSettings, setShowAlternateArt, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';
import { expandCards } from '../lib/cardDisplay';
import { BulkActionBar, type BulkTarget } from '../components/BulkActionBar';
import { BulkTargetSheet, type BulkSelection } from '../components/BulkTargetSheet';
import type { Card } from '../types';

type SortState = { key: SortKey; dir: 'asc' | 'desc' };

export function BrowseScreen({ navigation }: BrowseScreenProps) {
  const t = useT();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'code', dir: 'asc' });
  const [columns, setColumnsState] = useState(getSettings().columns);
  // Grid más apretado: las pastillas (framed) ya separan visualmente las cartas,
  // así que reducimos gap/padding respecto al resto de grids (estilo Collectr).
  const { cardWidth, gap, hPadding } = useCardGrid(columns, { gap: 8, hPadding: 18 });
  const [, force] = useState(0);

  // Multi-select / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, BulkSelection>>({});
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);
  const selectedList = Object.values(selected);

  const toggleSel = useCallback((key: string, code: string, suffix: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { code, suffix };
      return next;
    }), []);
  const clearSel = () => { setSelected({}); setSelectMode(false); };
  // Mantener pulsada una carta entra directamente en modo selección (igual que
  // en BinderScreen), sin tener que tocar el botón de la cabecera primero.
  const handleLongPressCard = useCallback((key: string, code: string, suffix: string) => {
    setSelectMode(true);
    toggleSel(key, code, suffix);
  }, [toggleSel]);

  // No nos suscribimos a cambios de cantidad: cada CardThumb (modo live) se
  // actualiza solo, así editar una copia no re-renderiza todo el grid.
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
    const result = fuzzyFilter(CARD_LIST.filter((c) => matches(c, filters)), debouncedQ);
    return sortCards(result, sort);
  }, [debouncedQ, filters, sort]);

  // Expand into display tiles (one per variant when Show Alternate Art is on).
  const entries = useMemo(() => expandCards(list), [list, showAlt]);

  const fcount = activeCount(filters);

  // Celda memoizada vía CardThumb (modo live): editar copias re-renderiza solo
  // la carta tocada. extraData/renderItem estables salvo cambios de selección.
  const extraData = useMemo(() => ({ selectMode, selected }), [selectMode, selected]);
  const renderItem = useCallback(({ item }: { item: ReturnType<typeof expandCards>[number] }) => {
    const src = item.variant?.set_source;
    const cardSet = setPrefix(item.card.code);
    return (
      <CardThumb
        card={item.card}
        // En showAlt pasamos la variante concreta; en modo normal dejamos que
        // CardThumb elija la más rara poseída.
        variant={showAlt ? item.variant : undefined}
        liveCode={item.card.code}
        livePerVariant={showAlt}
        liveMultiArt={!showAlt}
        dimWhenEmpty
        sourceSet={showAlt && src && src !== cardSet ? src : undefined}
        selected={selectMode && !!selected[item.key]}
        compact={columns >= 3}
        framed
        showFooter
        // Estilo Collectr: precio + "+" compacto en el footer (sustituye al
        // overlay central de quickActions). El "+" se oculta en modo selección.
        price={getPrice(item.card, showAlt ? item.variant?.suffix ?? '' : '')}
        priceChange={getPriceChangePct(item.card.code, showAlt ? item.variant?.suffix ?? '' : '')}
        onAdd={selectMode ? undefined : () => adjust(item.card.code, item.variant?.suffix ?? '', +1)}
        onRemove={selectMode ? undefined : () => adjust(item.card.code, item.variant?.suffix ?? '', -1)}
        onPress={() =>
          selectMode
            ? toggleSel(item.key, item.card.code, item.variant.suffix)
            : navigation.navigate('Detail', { code: item.card.code, suffix: item.variant?.suffix })
        }
        onLongPress={() => handleLongPressCard(item.key, item.card.code, item.variant?.suffix ?? '')}
        width={cardWidth}
      />
    );
  }, [showAlt, columns, cardWidth, selectMode, selected, navigation, toggleSel, handleLongPressCard]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.searchWrap}>
        <View style={s.search}>
          {/* Scan: la cámara vive ahora en la barra de búsqueda (antes era el
              FAB central). Acento + glow para que siga siendo la acción estrella. */}
          <Pressable
            onPress={() => navigation.navigate('Scan')}
            accessibilityRole="button"
            accessibilityLabel={t('tab.scan')}
            style={({ pressed }) => [s.scanBtn, pressed && pressedStyle]}
          >
            <Icon name="camera" size={20} color={colors.onAccent} stroke={2} />
          </Pressable>
          <Icon name="search" size={19} color={colors.textMut} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('browse.searchPlaceholder')}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={s.searchInput}
          />
          {q ? (
            <Pressable
              onPress={() => setQ('')}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={({ pressed }) => pressed && pressedStyle}
            >
              <Icon name="close" size={18} color={colors.textMut} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowFilters(true)}
          accessibilityRole="button"
          accessibilityLabel={t('filter.title')}
          style={({ pressed }) => [s.filterBtn, fcount > 0 && s.filterBtnOn, pressed && pressedStyle]}
        >
          <Icon
            name="filter"
            size={16}
            color={fcount > 0 ? colors.accent : colors.text}
          />
          <Text style={[s.filterBtnText, fcount > 0 && { color: colors.accent }]}>{t('filter.title')}</Text>
          {fcount > 0 ? (
            <Text style={s.filterBadge}>{fcount}</Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => { if (selectMode) clearSel(); else setSelectMode(true); }}
          accessibilityRole="button"
          accessibilityLabel={t('bulk.select')}
          accessibilityState={{ selected: selectMode }}
          style={({ pressed }) => [s.filterBtn, selectMode && s.filterBtnOn, pressed && pressedStyle]}
        >
          <Icon name={selectMode ? 'close' : 'checkSquare'} size={16} color={selectMode ? colors.accent : colors.text} />
          <Text style={[s.filterBtnText, selectMode && { color: colors.accent }]}>
            {selectMode ? t('common.done') : t('bulk.select')}
          </Text>
        </Pressable>
      </View>

      <View style={s.sortRow}>
        <Text style={s.sortCount}>{t('browse.cardsCount', { n: list.length })}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.sortScroll}
          contentContainerStyle={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}
        >
          <Pressable
            style={({ pressed }) => [s.sortBtn, showAlt && s.sortBtnOn, pressed && pressedStyle]}
            onPress={() => setShowAlternateArt(!showAlt)}
            accessibilityRole="button"
            accessibilityLabel={t('browse.parallels')}
            accessibilityState={{ selected: showAlt }}
          >
            <Icon name="sparkle" size={11} color={showAlt ? colors.accent : colors.textMut} />
            <Text style={[s.sortLabel, { color: showAlt ? colors.accent : colors.textMut }]}>
              {t('browse.parallels')}
            </Text>
          </Pressable>
          {(
            [
              ['code', 'sort.code', 'tag'],
              ['set', 'sort.set', 'layers'],
              ['rarity', 'sort.rarity', 'star'],
              ['cost', 'sort.cost', undefined],
              ['power', 'sort.power', 'bolt'],
              ['owned', 'sort.owned', undefined],
            ] as [SortKey, TKey, string | undefined][]
          ).map(([k, labelKey, icon]) => {
            const active = sort.key === k;
            return (
              <Pressable
                key={k}
                onPress={() => handleSort(k)}
                accessibilityRole="button"
                accessibilityLabel={t(labelKey)}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [s.sortBtn, active ? s.sortBtnOn : null, pressed && pressedStyle]}
              >
                {icon ? <Icon name={icon} size={11} color={active ? colors.accent : colors.textMut} /> : null}
                <Text style={[s.sortLabel, { color: active ? colors.accent : colors.textMut }]}>
                  {t(labelKey)}
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
        </ScrollView>
      </View>

      <FlatList
        key={`grid-${columns}`}
        data={entries}
        keyExtractor={(item) => item.key}
        numColumns={columns}
        extraData={extraData}
        columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: selectMode ? 180 : 110, gap }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews
        renderItem={renderItem}
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
    paddingLeft: 5,
    paddingRight: 14,
    height: 46,
  },
  scanBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, fontFamily: fonts.ui },
  filterBtn: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    position: 'relative',
  },
  filterBtnOn: { borderColor: colors.accent },
  filterBtnText: { fontSize: 12, fontFamily: fonts.uiSemi, color: colors.text },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: 10,
    fontFamily: fonts.uiBold,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sortCount: { fontSize: 13, color: colors.textMut, fontFamily: fonts.ui, flexShrink: 0 },
  sortScroll: { flex: 1 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 9, paddingVertical: 9, borderRadius: 9 },
  sortBtnOn: { backgroundColor: colors.accentDim },
  sortLabel: { fontSize: 12, fontFamily: fonts.uiSemi },
  grid: { paddingHorizontal: 18, paddingBottom: 110 },
  col: { justifyContent: 'space-between', marginBottom: 16 },
});
