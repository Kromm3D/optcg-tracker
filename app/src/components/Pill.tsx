// Chip clicable: All / Red / Green / etc. en BrowseScreen, y para el sort.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  leading?: React.ReactNode;
};

export function Pill({ label, active, onPress, color, leading }: Props) {
  const tint = color || colors.accent;
  return (
    <Pressable onPress={onPress} style={[
      styles.box,
      {
        borderColor: active ? tint : colors.border,
        backgroundColor: active
          ? (color ? color + '22' : colors.accentDim)
          : colors.surface,
      },
    ]}>
      {leading ? <View style={{ marginRight: 6 }}>{leading}</View> : null}
      <Text style={[
        styles.txt,
        { color: active ? tint : colors.textMut },
      ]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  txt: {
    fontSize: 13,
    fontFamily: fonts.uiSemi,
  },
});
