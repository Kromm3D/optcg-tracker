// MatchesScreen — sugerencias de match agregadas entre wishlist y colección
// de TODOS los amigos a la vez (ToDo.md §4). El matching en sí ya existía por
// amigo (FriendProfileScreen → pestaña Trade, gratis, sigue gratis); lo nuevo
// aquí es el DIGEST: en vez de abrir cada perfil uno a uno, recorre a todos
// de golpe y dice con quién merece la pena hablar. Gateado entero tras
// 'cloud' (a nivel de pantalla, mismo criterio que StatsScreen: es un digest
// cohesivo, no una feature con una parte gratis razonable que enseñar).

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MatchesScreenProps } from '../navigation';
import { smartGoBack } from '../lib/nav';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import { useHasEntitlement } from '../lib/entitlements';
import { getAllFriendMatches, type FriendMatchSummary } from '../lib/friendMatches';

export function MatchesScreen({ navigation }: MatchesScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const hasCloud = useHasEntitlement('cloud');

  const [loading, setLoading] = React.useState(true);
  const [matches, setMatches] = React.useState<FriendMatchSummary[]>([]);

  React.useEffect(() => {
    if (!hasCloud) return;
    let active = true;
    setLoading(true);
    void getAllFriendMatches().then((res) => {
      if (active) { setMatches(res); setLoading(false); }
    });
    return () => { active = false; };
  }, [hasCloud]);

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
        <Text style={s.headerTitle}>{t('matches.title')}</Text>
      </View>

      {!hasCloud ? (
        <View style={s.lockedWrap}>
          <Icon name="sparkle" size={36} color={colors.accent} />
          <Text style={s.lockedTitle}>{t('matches.lockedTitle')}</Text>
          <Text style={s.lockedDesc}>{t('matches.lockedDesc')}</Text>
          <Pressable
            style={({ pressed }) => [s.ctaBtn, pressed && pressedStyle]}
            onPress={() => navigation.navigate('Premium')}
            accessibilityRole="button"
            accessibilityLabel={t('premium.openScreen')}
          >
            <Text style={s.ctaBtnText}>{t('premium.openScreen')}</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : matches.length === 0 ? (
        <View style={s.lockedWrap}>
          <Icon name="swap" size={32} color={colors.textDim} />
          <Text style={s.lockedTitle}>{t('matches.empty')}</Text>
          <Text style={s.lockedDesc}>{t('matches.emptyDesc')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.intro}>{t('matches.intro')}</Text>
          {matches.map((m) => (
            <Pressable
              key={m.userId}
              style={({ pressed }) => [s.card, pressed && pressedSurface]}
              onPress={() => navigation.navigate('FriendProfile', { userId: m.userId, username: m.username })}
              accessibilityRole="button"
              accessibilityLabel={m.username}
            >
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle}>{m.username}</Text>
                <Icon name="chevR" size={18} color={colors.textMut} />
              </View>
              {m.give.length > 0 && (
                <Text style={s.matchLine}>
                  <Icon name="arrowUp" size={12} color={colors.accent} /> {t('matches.youGive', { n: m.give.length })}
                </Text>
              )}
              {m.receive.length > 0 && (
                <Text style={s.matchLine}>
                  <Icon name="arrowDn" size={12} color={colors.accent} /> {t('matches.youReceive', { n: m.receive.length })}
                </Text>
              )}
            </Pressable>
          ))}
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
  scroll: { padding: spacing.lg, gap: 10, paddingBottom: 110 },
  intro: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, lineHeight: 19, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  matchLine: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
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
