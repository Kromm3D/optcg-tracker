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
import { getOwnedFor, subscribe as subOwned } from '../lib/ownedAggregate';
import { getSettings, subscribe as subSettings } from '../lib/settings';
import { useCardGrid } from '../lib/useCardGrid';

export function SetDetailScreen({ route, navigation }: SetDetailScreenProps) {
  const { setCode } = route.params;
  const [, force] = useState(0);
  const [columns, setColumnsState] = useState(getSettings().columns);
  const { cardWidth, gap, hPadding } = useCardGrid(columns);
  const insets = useSafeAreaInsets();

  useEffect(() => subOwned(() => force((n) => n + 1)), []);
  useEffect(() => subSettings(() => setColumnsState(getSettings().columns)), []);

  const summary = summarizeSet(setCode);
  const rarities = useMemo(() => rarityBuckets(setCode), [setCode]);
  const date = setDateFor(setCode);

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
        <ColumnsToggle />
      </View>

      {/* Grid con quickActions */}
      <FlatList
        key={`grid-${columns}`}
        data={summary.cards}
        keyExtractor={(c) => c.code}
        numColumns={columns}
        columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 30, gap: gap + 6 }}
        renderItem={({ item }) => (
          <CardThumb
            card={item}
            owned={getOwnedFor(item.code)}
            compact={columns >= 4}
            quickActions
            onPress={() => navigation.navigate('Detail', { code: item.code })}
            width={cardWidth}
          />
        )}
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
  grid: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 30 },
  col: { justifyContent: 'space-between', marginBottom: 18 },
});
