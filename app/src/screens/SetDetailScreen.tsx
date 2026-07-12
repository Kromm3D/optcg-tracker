// SetDetail: header con badge circular + fecha, tira de progreso (anillo % +
// contadores por rareza) y grid con +/- inline. Estilo inspirado en la
// referencia comercial.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SetDetailScreenProps } from '../navigation';
import { colors, fonts, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { CardThumb } from '../components/CardThumb';
import { ColumnsToggle } from '../components/ColumnsToggle';
import { SetBanner } from '../components/SetBanner';
import { summarizeSet, rarityBuckets, setEntries } from '../lib/setsStats';
import { setNameFor, setDateFor } from '../lib/setMeta';
import { getVariantOwned, subscribe as subOwned } from '../lib/ownedAggregate';
import { getPrice } from '../lib/prices';
import { getPriceChangePct } from '../lib/priceHistory';
import { adjust } from '../lib/collection';
import { getSettings, setShowAlternateArt, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';
import { expandSetEntries, type DisplayEntry } from '../lib/cardDisplay';
import { BulkActionBar, type BulkTarget } from '../components/BulkActionBar';
import { BulkTargetSheet, type BulkSelection } from '../components/BulkTargetSheet';
import { SetBulkAddSheet } from '../components/SetBulkAddSheet';
import { smartGoBack } from '../lib/nav';
import { useT } from '../lib/i18n';
import type { Card, Variant } from '../types';

// Cantidad poseída en vivo dentro de un set, suscrita a ownedAggregate con
// bail-out (prev === next): editar una carta re-renderiza solo su celda.
// - Parallels ON  → cuenta la variante mostrada.
// - Parallels OFF → suma todas las variantes impresas en este set (mismo
//   criterio que la vista colapsada) y marca "varias artes" si posees ≥2.
function useLiveSetOwned(
  code: string,
  inSet: Variant[],
  showAlt: boolean,
  shownSuffix: string,
): { owned: number; multiArt: boolean } {
  const computeOwned = useCallback(
    () =>
      showAlt
        ? getVariantOwned(code, shownSuffix)
        : inSet.reduce((n, v) => n + getVariantOwned(code, v.suffix), 0),
    [code, inSet, showAlt, shownSuffix],
  );
  const computeMulti = useCallback(
    () => !showAlt && inSet.filter((v) => getVariantOwned(code, v.suffix) > 0).length >= 2,
    [code, inSet, showAlt],
  );

  const [owned, setOwned] = useState(computeOwned);
  const [multiArt, setMultiArt] = useState(computeMulti);
  useEffect(() => {
    const update = () => {
      setOwned((prev) => { const v = computeOwned(); return prev === v ? prev : v; });
      setMultiArt((prev) => { const v = computeMulti(); return prev === v ? prev : v; });
    };
    update();
    return subOwned(update);
  }, [computeOwned, computeMulti]);
  return { owned, multiArt };
}

type SetGridCardProps = {
  card: Card;
  variant: Variant;
  itemKey: string;
  inSet: Variant[];
  showAlt: boolean;
  compact: boolean;
  cardWidth: number;
  selectMode: boolean;
  selected: boolean;
  onPress: (card: Card, variant: Variant, key: string) => void;
};

// Celda memoizada del grid del set. La cantidad poseída se deriva en vivo, así
// un +/- sobre una carta re-renderiza únicamente su miniatura.
const SetGridCard = React.memo(function SetGridCard({
  card, variant, itemKey, inSet, showAlt, compact, cardWidth, selectMode, selected, onPress,
}: SetGridCardProps) {
  const { owned, multiArt } = useLiveSetOwned(card.code, inSet, showAlt, variant?.suffix ?? '');
  return (
    <CardThumb
      card={card}
      variant={variant}
      owned={owned}
      dimmed={owned === 0}
      multiArt={multiArt}
      selected={selectMode && selected}
      compact={compact}
      framed
      price={getPrice(card, variant?.suffix ?? '')}
      priceChange={getPriceChangePct(card.code, variant?.suffix ?? '')}
      onAdd={selectMode ? undefined : () => adjust(card.code, variant?.suffix ?? '', +1)}
      onRemove={selectMode ? undefined : () => adjust(card.code, variant?.suffix ?? '', -1)}
      onPress={() => onPress(card, variant, itemKey)}
      width={cardWidth}
    />
  );
});

export function SetDetailScreen({ route, navigation }: SetDetailScreenProps) {
  const { setCode } = route.params;
  const t = useT();
  // headerTick solo refresca la cabecera (anillo % + tira de rarezas). El grid
  // NO depende de él: las celdas se actualizan solas vía useLiveSetOwned, así un
  // +/- no re-renderiza toda la cuadrícula.
  const [headerTick, setHeaderTick] = useState(0);
  const [columns, setColumnsState] = useState(getSettings().columns);
  // Mismo grid apretado que Browse (las pastillas framed separan las cartas).
  const { cardWidth, gap, hPadding } = useCardGrid(columns, { gap: 8, hPadding: 18 });
  const insets = useSafeAreaInsets();

  // Multi-select / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, BulkSelection>>({});
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);
  const [showSetWL, setShowSetWL] = useState(false);
  const selectedList = Object.values(selected);

  const toggleSel = useCallback((key: string, code: string, suffix: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { code, suffix };
      return next;
    }), []);
  const clearSel = () => { setSelected({}); setSelectMode(false); };

  useEffect(() => {
    const unsubO = subOwned(() => setHeaderTick((n) => n + 1));
    const unsubS = subSettings(() => { setColumnsState(getSettings().columns); setHeaderTick((n) => n + 1); });
    return () => { unsubO(); unsubS(); };
  }, []);

  // Cabecera: recomputa con cada +/- (headerTick), pero es O(nº cartas del set).
  const summary = useMemo(() => summarizeSet(setCode), [setCode, headerTick]);
  const rarities = useMemo(() => rarityBuckets(setCode), [setCode, headerTick]);
  const date = setDateFor(setCode);

  const showAlt = getSettings().showAlternateArt;
  // Grid: derivado de setEntries (array cacheado y estable) → no se recalcula al
  // editar copias, solo al cambiar de set o alternar parallels.
  const entries = useMemo(() => expandSetEntries(setEntries(setCode)), [setCode, showAlt]);

  const compact = columns >= 4;
  const handlePressCard = useCallback((card: Card, variant: Variant, key: string) => {
    if (selectMode) toggleSel(key, card.code, variant?.suffix ?? '');
    else navigation.navigate('Detail', { code: card.code, suffix: variant?.suffix });
  }, [selectMode, toggleSel, navigation]);

  const extraData = useMemo(() => ({ selectMode, selected }), [selectMode, selected]);
  const renderItem = useCallback(({ item }: { item: DisplayEntry }) => (
    <SetGridCard
      card={item.card}
      variant={item.variant}
      itemKey={item.key}
      inSet={item.setVariants ?? item.card.variants}
      showAlt={showAlt}
      compact={compact}
      cardWidth={cardWidth}
      selectMode={selectMode}
      selected={!!selected[item.key]}
      onPress={handlePressCard}
    />
  ), [showAlt, compact, cardWidth, selectMode, selected, handlePressCard]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 10 }}>
        <SetBanner
          setCode={setCode}
          title={setNameFor(setCode)}
          date={date}
          owned={summary.owned}
          total={summary.total}
          pct={summary.pct}
          onBack={() => smartGoBack(navigation)}
          rarities={rarities}
        />
      </View>

      {/* Controles del grid */}
      {/* Card count vive arriba en el SetBanner (owned/total) — no se repite aquí. */}
      <View style={s.gridControls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.ctrlScroll}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Pressable
            style={({ pressed }) => [s.ctrlChip, showAlt && s.ctrlChipOn, pressed && pressedStyle]}
            onPress={() => setShowAlternateArt(!showAlt)}
            accessibilityRole="button"
            accessibilityLabel={t('set.parallels')}
            accessibilityState={{ selected: showAlt }}
          >
            <Icon name="sparkle" size={12} color={showAlt ? colors.accent : colors.textDim} />
            <Text style={[s.ctrlChipText, showAlt && s.ctrlChipTextOn]}>
              {t('set.parallels')}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.ctrlChip, showSetWL && s.ctrlBtnOn, pressed && pressedStyle]}
            onPress={() => setShowSetWL(true)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('setwl.addMissing')}
          >
            <Icon name="heart" size={13} color={colors.accent} />
            <Text style={s.ctrlChipText}>{t('setwl.addMissingShort')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.ctrlChip, selectMode && s.ctrlBtnOn, pressed && pressedStyle]}
            onPress={() => { if (selectMode) clearSel(); else setSelectMode(true); }}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('bulk.select')}
            accessibilityState={{ selected: selectMode }}
          >
            <Icon name={selectMode ? 'close' : 'checkSquare'} size={13} color={selectMode ? colors.accent : colors.textMut} />
            <Text style={[s.ctrlChipText, selectMode && s.ctrlChipTextOn]}>
              {selectMode ? t('common.done') : t('bulk.select')}
            </Text>
          </Pressable>
          <ColumnsToggle />
        </ScrollView>
      </View>

      {/* Grid con quickActions (o selección) */}
      <FlatList
        key={`grid-${columns}`}
        data={entries}
        keyExtractor={(e) => e.key}
        numColumns={columns}
        extraData={extraData}
        columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: selectMode ? 180 : 110, gap }}
        initialNumToRender={15}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews
        renderItem={renderItem}
      />

      {selectMode && (
        <BulkActionBar count={selectedList.length} onClear={clearSel} onPick={setBulkTarget} />
      )}

      <BulkTargetSheet
        visible={bulkTarget !== null}
        target={bulkTarget}
        selections={selectedList}
        onClose={() => setBulkTarget(null)}
        onDone={() => { setBulkTarget(null); clearSel(); }}
      />

      <SetBulkAddSheet
        visible={showSetWL}
        setCode={setCode}
        onClose={() => setShowSetWL(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  gridControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ctrlScroll: { flex: 1 },
  ctrlBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  ctrlChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  ctrlChipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  ctrlChipText: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textDim },
  ctrlChipTextOn: { color: colors.accent },
  grid: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 30 },
  col: { justifyContent: 'space-between', marginBottom: 18 },
});
