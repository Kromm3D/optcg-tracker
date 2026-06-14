// Stepper +/- unificado. Sustituye a las 6 implementaciones sueltas
// (26/28/30/36/42px) repartidas por la app. Deshabilita "−" en el suelo
// (M4: feedback de límite) y trae feedback de pulsación + a11y de serie.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Touchable } from './Touchable';
import { colors, fonts, type } from '../theme';

type Size = 'sm' | 'md';

interface Props {
  value: number;
  onAdjust: (delta: number) => void;
  /** Valor mínimo; "−" se deshabilita al alcanzarlo. Default 0. */
  min?: number;
  /** Valor máximo; "+" se deshabilita al alcanzarlo. */
  max?: number;
  size?: Size;
  /** Etiqueta accesible del elemento contado (p.ej. el código de carta). */
  label?: string;
}

export function Counter({ value, onAdjust, min = 0, max, size = 'md', label }: Props) {
  const dim = size === 'sm';
  const btn = [styles.btn, dim && styles.btnSm];
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  const a11y = label ? ` ${label}` : '';
  return (
    <View style={styles.row}>
      <Touchable
        style={[btn, atMin && styles.btnOff]}
        disabled={atMin}
        onPress={() => onAdjust(-1)}
        accessibilityLabel={`Remove one${a11y}`}
      >
        <Text style={[styles.sign, dim && styles.signSm, atMin && styles.signOff]}>−</Text>
      </Touchable>
      <Text style={[styles.qty, dim && styles.qtySm]}>{value}</Text>
      <Touchable
        style={[btn, atMax && styles.btnOff]}
        disabled={atMax}
        onPress={() => onAdjust(+1)}
        accessibilityLabel={`Add one${a11y}`}
      >
        <Text style={[styles.sign, dim && styles.signSm]}>+</Text>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSm: { width: 30, height: 30, borderRadius: 15 },
  btnOff: { opacity: 0.35 },
  sign: { fontSize: type.h2, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 22 },
  signSm: { fontSize: type.title, lineHeight: 20 },
  signOff: { color: colors.textDim },
  qty: {
    fontSize: type.title,
    fontFamily: fonts.display,
    color: colors.text,
    minWidth: 22,
    textAlign: 'center',
  },
  qtySm: { fontSize: type.body, minWidth: 18 },
});
