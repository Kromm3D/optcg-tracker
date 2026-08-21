// StatsScreen — dashboard avanzado (ToDo.md §4): valor por set, %
// completitud, cartas más valiosas, distribución por rareza. Gateado entero
// tras 'cloud' (a nivel de pantalla, no por sección — el ToDo lo enmarca como
// una única feature cohesiva). Sin librería de gráficas: barras simples con
// View + porcentaje de ancho, igual que el resto de la app.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StatsScreenProps } from '../navigation';
import { smartGoBack } from '../lib/nav';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { CachedImage } from '../components/CachedImage';
import { useT } from '../lib/i18n';
import { useHasEntitlement } from '../lib/entitlements';
import { resolveImageUris } from '../lib/images';
import { setNameFor } from '../lib/setMeta';
import { formatEur } from '../lib/currency';
import {
  valueBySet,
  completionBySet,
  topValuableItems,
  rarityDistribution,
} from '../lib/dashboardStats';

const TOP_N = 10;

export function StatsScreen({ navigation }: StatsScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const hasCloud = useHasEntitlement('cloud');

  const bySet = React.useMemo(() => (hasCloud ? valueBySet() : []), [hasCloud]);
  const completion = React.useMemo(() => (hasCloud ? completionBySet().slice(0, TOP_N) : []), [hasCloud]);
  const topItems = React.useMemo(() => (hasCloud ? topValuableItems(TOP_N) : []), [hasCloud]);
  const rarity = React.useMemo(() => (hasCloud ? rarityDistribution() : []), [hasCloud]);

  const maxSetValue = bySet.length ? bySet[0].value : 0;
  const maxRarityTotal = rarity.length ? Math.max(...rarity.map((r) => r.total)) : 0;

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
        <Text style={s.headerTitle}>{t('stats.title')}</Text>
      </View>

      {!hasCloud ? (
        <View style={s.lockedWrap}>
          <Icon name="sparkle" size={36} color={colors.accent} />
          <Text style={s.lockedTitle}>{t('stats.lockedTitle')}</Text>
          <Text style={s.lockedDesc}>{t('stats.lockedDesc')}</Text>
          <Pressable
            style={({ pressed }) => [s.ctaBtn, pressed && pressedStyle]}
            onPress={() => navigation.navigate('Premium')}
            accessibilityRole="button"
            accessibilityLabel={t('premium.openScreen')}
          >
            <Text style={s.ctaBtnText}>{t('premium.openScreen')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.sectionLabel}>{t('stats.valueBySet')}</Text>
          {bySet.length === 0 ? (
            <Text style={s.empty}>{t('stats.empty')}</Text>
          ) : (
            <View style={s.card}>
              {bySet.map((row) => (
                <View key={row.code} style={s.barRow}>
                  <Text style={s.barLabel} numberOfLines={1}>{row.name}</Text>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${maxSetValue > 0 ? (row.value / maxSetValue) * 100 : 0}%` },
                      ]}
                    />
                  </View>
                  <Text style={s.barValue}>{formatEur(row.value, { compact: true, grouped: true })}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={s.sectionLabel}>{t('stats.completionBySet')}</Text>
          {completion.length === 0 ? (
            <Text style={s.empty}>{t('stats.empty')}</Text>
          ) : (
            <View style={s.card}>
              {completion.map((row) => (
                <View key={row.code} style={s.barRow}>
                  <Text style={s.barLabel} numberOfLines={1}>{setNameFor(row.code)}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${row.pct}%` }]} />
                  </View>
                  <Text style={s.barValue}>{Math.round(row.pct)}%</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={s.sectionLabel}>{t('stats.topValuable')}</Text>
          {topItems.length === 0 ? (
            <Text style={s.empty}>{t('stats.empty')}</Text>
          ) : (
            <View style={s.card}>
              {topItems.map(({ item, card, variant, value }) => {
                const { uri, fallback } = resolveImageUris(variant);
                return (
                  <Pressable
                    key={`${item.code}${item.suffix}`}
                    style={({ pressed }) => [s.cardRow, pressed && pressedStyle]}
                    onPress={() => navigation.navigate('Detail', { code: item.code, suffix: item.suffix })}
                    accessibilityRole="button"
                    accessibilityLabel={card.name}
                  >
                    <CachedImage uri={uri} fallbackUri={fallback} style={s.thumb} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardRowTitle} numberOfLines={1}>{card.name}</Text>
                      <Text style={s.cardRowSub}>{item.code}{item.suffix} · x{item.count}</Text>
                    </View>
                    <Text style={s.cardRowValue}>{formatEur(value, { compact: true, grouped: true })}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={s.sectionLabel}>{t('stats.rarityDistribution')}</Text>
          {rarity.length === 0 ? (
            <Text style={s.empty}>{t('stats.empty')}</Text>
          ) : (
            <View style={s.card}>
              {rarity.map((row) => (
                <View key={row.rarity} style={s.barRow}>
                  <Text style={s.barLabel} numberOfLines={1}>{row.rarity}</Text>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${maxRarityTotal > 0 ? (row.total / maxRarityTotal) * 100 : 0}%` },
                      ]}
                    />
                  </View>
                  <Text style={s.barValue}>{row.owned}/{row.total}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
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
  scroll: { padding: spacing.lg, gap: 8, paddingBottom: 110 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 4,
  },
  empty: { fontSize: 13, fontFamily: fonts.ui, color: colors.textDim, paddingVertical: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 110, fontSize: 12, fontFamily: fonts.uiSemi, color: colors.text },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  barValue: { width: 60, textAlign: 'right', fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 50, borderRadius: 6, backgroundColor: colors.surface2 },
  cardRowTitle: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.text },
  cardRowSub: { fontSize: 11, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  cardRowValue: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.accent },
  lockedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg * 1.5,
    gap: 10,
  },
  lockedTitle: { fontSize: 18, fontFamily: fonts.uiSemi, color: colors.text, textAlign: 'center' },
  lockedDesc: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center', lineHeight: 19 },
  ctaBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  ctaBtnText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.bg },
});
