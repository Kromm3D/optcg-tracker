// Cabecera de sección: "By color", "Recent additions", etc. con opcional
// botón de acción en la derecha ("Browse →").

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  title: string;
  action?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, action, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action && (
        <Pressable onPress={onAction}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.2,
  },
  action: {
    fontSize: 13,
    fontFamily: fonts.uiSemi,
    color: colors.accent,
  },
});
