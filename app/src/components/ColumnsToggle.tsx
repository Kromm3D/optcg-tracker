// Toggle 2/3/4/5 columnas. Conectado a lib/settings.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, pressedStyle } from '../theme';
import {
  getSettings,
  setColumns,
  subscribe,
  Settings,
} from '../lib/settings';

export function ColumnsToggle() {
  const [cols, setCols] = useState<Settings['columns']>(getSettings().columns);

  useEffect(() => {
    const unsub = subscribe(() => setCols(getSettings().columns));
    return unsub;
  }, []);

  return (
    <View style={s.row}>
      {([2, 3, 4, 5] as const).map((n) => {
        const on = cols === n;
        return (
          <Pressable
            key={n}
            onPress={() => setColumns(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${n}`}
            style={({ pressed }) => [s.btn, on && s.btnOn, pressed && pressedStyle]}
          >
            <Text style={[s.txt, on && s.txtOn]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    padding: 2,
  },
  btn: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 7,
    minWidth: 26,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: colors.accentDim },
  txt: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
  },
  txtOn: { color: colors.accent },
});
