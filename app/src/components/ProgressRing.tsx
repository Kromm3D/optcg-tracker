// Anillo de progreso circular con el porcentaje en el centro. SVG sobre
// react-native-svg (ya dependencia del proyecto via Icon).

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';

type Props = {
  /** 0-100. */
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
};

export function ProgressRing({
  pct,
  size = 56,
  stroke = 5,
  // Cian "fantasma" por defecto: el progreso/colección es el color semántico.
  color = colors.ghost,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={colors.ring}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        <Text style={[s.pct, { fontSize: size * 0.26 }]}>{clamped}%</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  pct: { fontFamily: fonts.uiBold, color: colors.text },
});
