// Profile: hub de la pestaña Perfil. Reúne identidad (sesión) + accesos a
// Cuenta/sync, Amigos y Ajustes. Reemplaza la entrada que antes vivía sólo en
// el engranaje de la cabecera; ese engranaje se mantiene (acceso redundante).
// Las pantallas destino (Account/Friends/Settings) son del stack raíz.

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ProfileScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface } from '../theme';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import type { TKey } from '../i18n/en';
import { isSupabaseEnabled } from '../lib/supabase';
import { getProfile, isSignedIn, subscribe as subAuth } from '../lib/auth';

type Row = { icon: string; title: TKey; desc: TKey; route: 'Account' | 'Friends' | 'Settings' };

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [, force] = useState(0);
  useEffect(() => subAuth(() => force((n) => n + 1)), []);

  const backendEnabled = isSupabaseEnabled();
  const signedIn = isSignedIn();
  const profile = getProfile();
  const name = signedIn ? (profile?.username ?? '…') : t('profile.guest');
  const initial = signedIn ? (profile?.username?.[0]?.toUpperCase() ?? '?') : null;

  // Friends sólo tiene sentido con backend y sesión iniciada (igual que en
  // AccountScreen, que esconde el acceso a Friends tras el estado signed-in).
  const rows: Row[] = [
    { icon: 'user', title: 'profile.account', desc: 'profile.accountDesc', route: 'Account' },
    ...(backendEnabled && signedIn
      ? [{ icon: 'binder', title: 'profile.friends', desc: 'profile.friendsDesc', route: 'Friends' } as Row]
      : []),
    { icon: 'gear', title: 'profile.settings', desc: 'profile.settingsDesc', route: 'Settings' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Text style={s.headerTitle}>{t('profile.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Identity card — tap to manage the account (sign in / sync). */}
        <Pressable
          style={({ pressed }) => [s.idCard, pressed && pressedSurface]}
          onPress={() => navigation.navigate('Account')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.account')}
        >
          <View style={s.avatar}>
            {initial ? (
              <Text style={s.avatarText}>{initial}</Text>
            ) : (
              <Icon name="user" size={26} color={colors.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.idName} numberOfLines={1}>{name}</Text>
            <Text style={s.idDesc} numberOfLines={2}>
              {signedIn ? t('account.synced') : t('profile.guestDesc')}
            </Text>
          </View>
          <Icon name="chevR" size={20} color={colors.textMut} />
        </Pressable>

        {/* Hub rows */}
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {rows.map((row) => (
            <Pressable
              key={row.route}
              style={({ pressed }) => [s.navRow, pressed && pressedSurface]}
              onPress={() => navigation.navigate(row.route)}
              accessibilityRole="button"
              accessibilityLabel={t(row.title)}
            >
              <View style={s.navIcon}>
                <Icon name={row.icon} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.navTitle}>{t(row.title)}</Text>
                <Text style={s.navDesc} numberOfLines={1}>{t(row.desc)}</Text>
              </View>
              <Icon name="chevR" size={18} color={colors.textMut} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.6,
  },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  idCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontFamily: fonts.display, color: colors.accent },
  idName: { fontSize: 18, fontFamily: fonts.uiBold, color: colors.text },
  idDesc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2, lineHeight: 17 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  navDesc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 1 },
});
