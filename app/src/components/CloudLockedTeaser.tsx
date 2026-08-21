// Teaser genérico para cualquier feature de pago (nació para 'cloud':
// histórico de precio, gráfica de valor, alertas; reusado también para
// 'unlocks', p.ej. exportar) cuando el usuario quiere usarla pero no la ha
// pagado. Nunca esconde el hueco sin más: enseña qué se está perdiendo y
// lleva a PremiumScreen — ver lib/entitlements.ts para por qué esto es un eje
// aparte de FeatureKey.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, pressedStyle } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import type { TKey } from '../i18n/en';

type Props = {
  label: TKey;
  onPress: () => void;
};

export function CloudLockedTeaser({ label, onPress }: Props) {
  const t = useT();
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && pressedStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t(label)}
    >
      <Icon name="sparkle" size={16} color={colors.accent} />
      <Text style={s.text}>{t(label)}</Text>
      <Icon name="chevR" size={16} color={colors.textMut} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  text: { flex: 1, fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
});
