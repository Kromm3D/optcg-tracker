// Punto pequeño con el color OPTCG de la carta. Si la carta es multicolor
// se renderiza un dot con un degradado entre los dos.

import React from 'react';
import { View } from 'react-native';
import { colorOf } from '../theme';

type Props = {
  colors?: string[];
  size?: number;
};

export function ColorDot({ colors: cs, size = 9 }: Props) {
  if (!cs || cs.length === 0) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 99,
          backgroundColor: '#5e6775',
        }}
      />
    );
  }
  const primary = colorOf(cs[0]);
  if (cs.length === 1) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 99,
          backgroundColor: primary,
          shadowColor: primary,
          shadowOpacity: 0.6,
          shadowRadius: 4,
        }}
      />
    );
  }
  // Bicolor: dividimos el círculo en dos mitades verticales
  const secondary = colorOf(cs[1]);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      <View style={{ flex: 1, backgroundColor: primary }} />
      <View style={{ flex: 1, backgroundColor: secondary }} />
    </View>
  );
}
