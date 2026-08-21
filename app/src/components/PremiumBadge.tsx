// Insignia cosmética de perfil premium, visible a amigos. Ver
// `pushPremiumBadge` en lib/friends.ts — refleja `isPremium()` en
// `profiles.is_premium` para que otros usuarios la vean sin depender de mis
// entitlements locales.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';

export function PremiumBadge({ size = 14 }: { size?: number }) {
  const t = useT();
  return (
    <View style={s.wrap} accessibilityLabel={t('premium.badge')}>
      <Icon name="sparkle" size={size} color={colors.accent} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginLeft: 4 },
});
