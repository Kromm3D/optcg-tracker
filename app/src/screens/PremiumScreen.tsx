// PremiumScreen — shell del paywall. Lista los 3 productos del plan de
// monetización (ver lib/entitlements.ts + ToDo.md), todos en estado
// "Próximamente": sin RevenueCat conectado todavía no hay nada que comprar,
// así que ningún botón promete una compra que no puede completar.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PremiumScreenProps } from '../navigation';
import { smartGoBack } from '../lib/nav';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import type { TKey } from '../i18n/en';
import {
  getEntitlements,
  loadEntitlements,
  setDevEntitlements,
  subscribe as subEntitlements,
  type Entitlement,
} from '../lib/entitlements';

const PRODUCTS: Array<{
  key: Entitlement;
  icon: 'close' | 'sparkle' | 'cloud';
  title: TKey;
  desc: TKey;
}> = [
  { key: 'removeAds', icon: 'close', title: 'premium.removeAdsTitle', desc: 'premium.removeAdsDesc' },
  { key: 'unlocks', icon: 'sparkle', title: 'premium.unlocksTitle', desc: 'premium.unlocksDesc' },
  { key: 'cloud', icon: 'cloud', title: 'premium.cloudTitle', desc: 'premium.cloudDesc' },
];

export function PremiumScreen({ navigation }: PremiumScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [, force] = React.useState(0);
  React.useEffect(() => {
    loadEntitlements().then(() => force((n) => n + 1));
    return subEntitlements(() => force((n) => n + 1));
  }, []);
  const granted = getEntitlements().granted;

  async function toggleDev(key: Entitlement) {
    const next = granted.includes(key) ? granted.filter((g) => g !== key) : [...granted, key];
    await setDevEntitlements(next);
  }

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
        <Text style={s.headerTitle}>{t('premium.screenTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.intro}>{t('premium.screenIntro')}</Text>

        {PRODUCTS.map((p) => (
          <View key={p.key} style={s.card}>
            <View style={s.cardHeaderRow}>
              <Icon name={p.icon} size={20} color={colors.accent} />
              <Text style={s.cardTitle}>{t(p.title)}</Text>
              <View style={s.badge}>
                <Text style={s.badgeText}>{t('premium.comingSoon')}</Text>
              </View>
            </View>
            <Text style={s.cardDesc}>{t(p.desc)}</Text>
          </View>
        ))}

        <Text style={s.note}>{t('premium.soon')}</Text>

        {__DEV__ && (
          <View style={s.devSection}>
            <Text style={s.sectionLabel}>{t('premium.devToolsTitle')}</Text>
            <Text style={s.desc}>{t('premium.devToolsDesc')}</Text>
            <View style={s.row}>
              {PRODUCTS.map((p) => {
                const on = granted.includes(p.key);
                return (
                  <Pressable
                    key={p.key}
                    style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                    onPress={() => toggleDev(p.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(p.title)}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{t(p.title)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
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
  scroll: { padding: spacing.lg, gap: 12, paddingBottom: 110 },
  intro: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, lineHeight: 19, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  cardDesc: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, lineHeight: 19 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
  },
  badgeText: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },
  note: { fontSize: 12, fontFamily: fonts.ui, color: colors.textDim, textAlign: 'center', marginTop: 4 },
  devSection: { marginTop: 18, gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  desc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  chipText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  chipTextOn: { color: colors.accent },
});
