// Etiqueta pequeña con la rareza. Las rarezas "hot" (SR, L, SEC...) van
// con fondo accent; el resto, con un chip neutro.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, HOT_RARITIES } from '../theme';

export function RarityPip({ rarity }: { rarity: string }) {
  if (!rarity) return null;
  const hot = HOT_RARITIES.has(rarity.toUpperCase());
  return (
    <View style={[styles.box, hot ? styles.hot : styles.cold]}>
      <Text style={[styles.txt, hot ? styles.txtHot : styles.txtCold]}>
        {rarity}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  hot: { backgroundColor: colors.accent },
  cold: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txt: {
    fontSize: 10,
    fontFamily: fonts.uiBold,
    letterSpacing: 0.4,
  },
  txtHot: { color: '#0a0c10' },
  txtCold: { color: colors.textDim },
});
