// Chip seleccionable unificado (filtros, settings, sort). Press feedback +
// área táctil mínima de serie. M3 / C1 / C2.
import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { Touchable } from './Touchable';
import { colors, fonts, type, MIN_TOUCH } from '../theme';

interface Props {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /** Contenido a la izquierda del texto (p.ej. un dot de color o icono). */
  left?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, active = false, onPress, left, style }: Props) {
  return (
    <Touchable
      style={[styles.chip, active && styles.chipOn, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {left ? <View style={styles.left}>{left}</View> : null}
      <Text style={[styles.label, active && styles.labelOn]}>{label}</Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH - 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  left: { marginRight: 6 },
  label: { fontSize: type.label, fontFamily: fonts.uiSemi, color: colors.textMut },
  labelOn: { color: colors.text, fontFamily: fonts.uiBold },
});
