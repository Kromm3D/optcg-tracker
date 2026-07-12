// Toggle 2/3/4/5 columnas. Conectado a lib/settings.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, pressedStyle } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import {
  getSettings,
  setColumns,
  subscribe,
  Settings,
} from '../lib/settings';

export function ColumnsToggle() {
  const t = useT();
  const [cols, setCols] = useState<Settings['columns']>(getSettings().columns);

  useEffect(() => {
    const unsub = subscribe(() => setCols(getSettings().columns));
    return unsub;
  }, []);

  return (
    <View style={s.wrap}>
      <Icon name="grid" size={12} color={colors.textMut} />
      <Text style={s.label}>{t('common.columns')}</Text>
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
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textMut },
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
