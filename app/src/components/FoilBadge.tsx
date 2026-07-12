// Chip "foil" holográfico: el guiño "Horo Horo = Holographic". Un degradado
// iridiscente (rosa→lila→cian) sobre el que va una etiqueta corta (la rareza
// premium). Reservado a rarezas holo — ver HOLO_RARITIES / CardThumb. Usa
// react-native-svg (ya es dependencia) para el degradado; el texto es un <Text>
// normal encima para que quede nítido.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { fonts, FOIL_STOPS, onFoil } from '../theme';

export function FoilBadge({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <View style={[s.wrap, compact && s.wrapSm]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <LinearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
            {FOIL_STOPS.map((c, i) => (
              <Stop key={i} offset={i / (FOIL_STOPS.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx="5" fill="url(#foil)" />
      </Svg>
      <Text style={[s.label, compact && s.labelSm]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  wrapSm: { paddingHorizontal: 5, paddingVertical: 1 },
  label: { fontSize: 9.5, fontFamily: fonts.uiBold, color: onFoil, letterSpacing: 0.4 },
  labelSm: { fontSize: 8.5 },
});
