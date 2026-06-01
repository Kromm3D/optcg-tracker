// SetDetail: header con badge circular + fecha, tira de progreso (anillo % +
// contadores por rareza) y grid con +/- inline. Estilo inspirado en la
// referencia comercial.

import React, { useEffect, useMemo, useState } from 'react';
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
import { colors, fonts } from '../theme';
import { Icon } from '../components/Icon';
import { CardThumb } from '../components/CardThumb';
import { ColumnsToggle } from '../components/ColumnsToggle';
import { SetBadge } from '../components/SetBadge';
import { ProgressRing } from '../components/ProgressRing';
import { summarizeSet, rarityBuckets } from '../lib/setsStats';
import { setNameFor, setDateFor } from '../lib/setMeta';
import { getVariantOwned, subscribe as subOwned } from '../lib/ownedAggregate';
import { getSettings, setShowAlternateArt, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';
import { expandSetEntries } from '../lib/cardDisplay';
import { BulkActionBar, type BulkTarget } from '../components/BulkActionBar';
import { BulkTargetSheet, type BulkSelection } from '../components/BulkTargetSheet';
import { SetWishlistSheet } from '../components/SetWishlistSheet';
import { useT } from '../lib/i18n';

export function SetDetailScreen({ route, navigation }: SetDetailScreenProps) {
  const { setCode } = route.params;
  const t = useT();
  const [, force] = useState(0);
  const [columns, setColumnsState] = useState(getSettings().columns);
  const { cardWidth, gap, hPadding } = useCardGrid(columns);
  const insets = useSafeAreaInsets();

  // Multi-select / bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, BulkSelection>>({});
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);
  const [showSetWL, setShowSetWL] = useState(false);
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

  const summary = summarizeSet(setCode);
  const rarities = useMemo(() => rarityBuckets(setCode), [setCode]);
  const date = setDateFor(setCode);

  const showAlt = getSettings().showAlternateArt;
  const entries = useMemo(() => expandSetEntries(summary.entries), [setCode, showAlt]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="chevL" size={20} color={colors.text} />
        </Pressable>
        <SetBadge setCode={setCode} size={52} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.title} numberOfLines={1}>{setNameFor(setCode)}</Text>
          {date ? <Text style={s.date}>{date}</Text> : null}
        </View>
      </View>

      {/* Tira de progreso: anillo % + contadores por rareza */}
      <View style={s.progressRow}>
        <ProgressRing pct={summary.pct} size={56} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.rarityRow}
        >
          {rarities.map((b) => (
            <View key={b.rarity} style={s.rarityCol}>
              <Text style={s.rarityVal}>
                {b.owned}/{b.total}
              </Text>
              <Text style={s.rarityLab}>{b.rarity}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Controles del grid */}
      <View style={s.gridControls}>
        <Text style={s.gridMeta}>{summary.cards.length} cartas</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            style={[s.ctrlChip, showAlt && s.ctrlChipOn]}
            onPress={() => setShowAlternateArt(!showAlt)}
          >
            <Text style={[s.ctrlChipText, showAlt && s.ctrlChipTextOn]}>
              Parallels
            </Text>
          </Pressable>
          <Pressable
            style={[s.ctrlBtn, showSetWL && s.ctrlBtnOn]}
            onPress={() => setShowSetWL(true)}
            accessibilityLabel={t('setwl.addMissing')}
          >
            <Icon name="heart" size={16} color={colors.accent} />
          </Pressable>
          <Pressable
            style={[s.ctrlBtn, selectMode && s.ctrlBtnOn]}
            onPress={() => { if (selectMode) clearSel(); else setSelectMode(true); }}
          >
            <Icon name={selectMode ? 'close' : 'check'} size={16} color={selectMode ? colors.accent : colors.textMut} />
          </Pressable>
          <ColumnsToggle />
        </View>
      </View>

      {/* Grid con quickActions (o selección) */}
      <FlatList
        key={`grid-${columns}`}
        data={entries}
        keyExtractor={(e) => e.key}
        numColumns={columns}
        extraData={{ selectMode, selected }}
        columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: selectMode ? 180 : 30, gap: gap + 6 }}
        renderItem={({ item }) => {
          // Collapsed (parallels off) counts every in-set variant; expanded
          // counts just the shown variant.
          const inSet = item.setVariants ?? item.card.variants;
          const ownedCount = showAlt
            ? getVariantOwned(item.card.code, item.variant.suffix)
            : inSet.reduce((n, v) => n + getVariantOwned(item.card.code, v.suffix), 0);
          return (
            <CardThumb
              card={item.card}
              variant={item.variant}
              owned={ownedCount}
              dimmed={ownedCount === 0}
              multiArt={!showAlt && inSet.filter((v) => getVariantOwned(item.card.code, v.suffix) > 0).length >= 2}
              selected={selectMode && !!selected[item.key]}
              compact={columns >= 4}
              quickActions={!selectMode}
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
        <BulkActionBar count={selectedList.length} onClear={clearSel} onPick={setBulkTarget} />
      )}

      <BulkTargetSheet
        visible={bulkTarget !== null}
        target={bulkTarget}
        selections={selectedList}
        onClose={() => setBulkTarget(null)}
        onDone={() => { setBulkTarget(null); clearSel(); }}
      />

      <SetWishlistSheet
        visible={showSetWL}
        setCode={setCode}
        onClose={() => setShowSetWL(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, color: colors.text, fontFamily: fonts.display },
  date: { fontSize: 12, color: colors.textMut, fontFamily: fonts.ui, marginTop: 2 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 12,
  },
  rarityRow: { alignItems: 'center', gap: 18, paddingHorizontal: 4 },
  rarityCol: { alignItems: 'center', minWidth: 36 },
  rarityVal: { fontSize: 15, fontFamily: fonts.display, color: colors.text },
  rarityLab: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textDim, marginTop: 3 },
  gridControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  gridMeta: { color: colors.textDim, fontFamily: fonts.ui, fontSize: 13 },
  ctrlBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  ctrlChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  ctrlChipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  ctrlChipText: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textDim },
  ctrlChipTextOn: { color: colors.accent },
  grid: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 30 },
  col: { justifyContent: 'space-between', marginBottom: 18 },
});
