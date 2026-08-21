// Toggle 2/3/4/5 columnas. Conectado a lib/settings.
//
// `compact`: en filas con muchos controles (Browse sort row, Binder action
// row) la versión expandida (icono + label + 4 botones ≈150px) no cabe sin
// scroll horizontal. En ese modo se colapsa a un único botón cuadrado que
// abre un modal con las mismas opciones — siempre visible, cero scroll.

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, pressedStyle } from '../theme';
import { Icon } from './Icon';
import { AppModal } from './AppModal';
import { useT } from '../lib/i18n';
import {
  getSettings,
  setColumns,
  subscribe,
  Settings,
} from '../lib/settings';

export function ColumnsToggle({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [cols, setCols] = useState<Settings['columns']>(getSettings().columns);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const unsub = subscribe(() => setCols(getSettings().columns));
    return unsub;
  }, []);

  const options = ([2, 3, 4, 5] as const).map((n) => {
    const on = cols === n;
    return (
      <Pressable
        key={n}
        onPress={() => { setColumns(n); setShowPicker(false); }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${n}`}
        style={({ pressed }) => [s.btn, on && s.btnOn, pressed && pressedStyle]}
      >
        <Text style={[s.txt, on && s.txtOn]}>{n}</Text>
      </Pressable>
    );
  });

  if (compact) {
    return (
      <>
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('common.columns')}
          style={({ pressed }) => [s.compactBtn, pressed && pressedStyle]}
        >
          <Icon name="grid" size={13} color={colors.textMut} />
          <Text style={s.compactTxt}>{cols}</Text>
        </Pressable>
        <AppModal visible={showPicker} onClose={() => setShowPicker(false)} title={t('common.columns')}>
          <View style={[s.row, s.rowModal]}>{options}</View>
        </AppModal>
      </>
    );
  }

  return (
    <View style={s.wrap}>
      <Icon name="grid" size={12} color={colors.textMut} />
      <Text style={s.label}>{t('common.columns')}</Text>
      <View style={s.row}>{options}</View>
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
  rowModal: { alignSelf: 'flex-start' },
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
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    height: 34,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactTxt: { fontSize: 12, fontFamily: fonts.uiSemi, color: colors.textMut },
});
