// Tile de estadística pequeña ("Cards · 174 · 88 unique").

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
};

export function StatTile({ label, value, sub, accent }: Props) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 24,
    fontFamily: fonts.display,
    color: colors.text,
    marginTop: 5,
    lineHeight: 26,
  },
  sub: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: 5,
  },
});
