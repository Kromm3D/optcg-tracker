// ProfileOnboardingScreen — la única pregunta del primer arranque.
//
// No es un tour ni un carrusel: es una pantalla, dos opciones y un "saltar".
// Sirve para que alguien que sólo quiere apuntar qué cartas tiene no se
// encuentre de golpe con gradeo, coste base y gráficas de cartera.
//
// Se puede saltar y se puede cambiar luego en Ajustes, así que la respuesta
// no compromete a nada. Y como el perfil sólo oculta interfaz (ver la nota en
// lib/settings.ts), elegir mal no pierde datos.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, pressedStyle } from '../theme';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import type { TKey } from '../i18n/en';
import { DEFAULT_PROFILE, setProfile, type UserProfile } from '../lib/settings';

type Choice = {
  profile: UserProfile;
  icon: string;
  title: TKey;
  desc: TKey;
  bullets: TKey[];
};

const CHOICES: Choice[] = [
  {
    profile: 'simple',
    icon: 'binder',
    title: 'onboard.simpleTitle',
    desc: 'onboard.simpleDesc',
    bullets: ['onboard.simpleB1', 'onboard.simpleB2', 'onboard.simpleB3'],
  },
  {
    profile: 'full',
    icon: 'bolt',
    title: 'onboard.fullTitle',
    desc: 'onboard.fullDesc',
    bullets: ['onboard.fullB1', 'onboard.fullB2', 'onboard.fullB3'],
  },
];

export function ProfileOnboardingScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();

  const pick = async (profile: UserProfile) => {
    await setProfile(profile);
    onDone();
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 20 }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{t('onboard.title')}</Text>
        <Text style={s.sub}>{t('onboard.sub')}</Text>

        {CHOICES.map((c) => (
          <Pressable
            key={c.profile}
            style={({ pressed }) => [s.card, pressed && pressedStyle]}
            onPress={() => pick(c.profile)}
            accessibilityRole="button"
            accessibilityLabel={t(c.title)}
          >
            <View style={s.cardHead}>
              <View style={s.cardIcon}>
                <Icon name={c.icon} size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{t(c.title)}</Text>
                <Text style={s.cardDesc}>{t(c.desc)}</Text>
              </View>
              <Icon name="chevR" size={20} color={colors.textMut} />
            </View>
            <View style={s.bullets}>
              {c.bullets.map((b) => (
                <View key={b} style={s.bulletRow}>
                  <View style={s.dot} />
                  <Text style={s.bulletText}>{t(b)}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        ))}

        {/* Que se pueda cambiar después no es letra pequeña: es lo que hace que
            elegir aquí no dé pereza. Va visible, no escondido. */}
        <Text style={s.note}>{t('onboard.note')}</Text>

        <Pressable
          style={({ pressed }) => [s.skip, pressed && pressedStyle]}
          onPress={() => pick(DEFAULT_PROFILE)}
          accessibilityRole="button"
          accessibilityLabel={t('onboard.skip')}
        >
          <Text style={s.skipText}>{t('onboard.skip')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 18 },
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, marginTop: -6, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: 12,
    marginTop: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontFamily: fonts.uiBold, color: colors.text },
  cardDesc: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  bullets: { gap: 6, paddingLeft: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  bulletText: { flex: 1, fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  note: { fontSize: 12, fontFamily: fonts.ui, color: colors.textDim, textAlign: 'center', marginTop: 6 },
  skip: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
});
