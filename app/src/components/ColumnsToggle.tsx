// Toggle 2/3/4/5 columnas. Conectado a lib/settings.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
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
            style={[s.btn, on && s.btnOn]}
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
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    minWidth: 22,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: colors.accentDim },
  txt: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
  },
  txtOn: { color: colors.accent },
});
