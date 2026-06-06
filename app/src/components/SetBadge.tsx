// Badge circular del set: muestra el prefijo de letras arriba y el numero
// abajo (ej: OP16 -> "OP" / "16"). Usado en el header de SetDetail y en las
// filas de SetsScreen.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

type Props = {
  /** Codigo del set, ej "OP16", "EB01", "PRB01", "P". */
  setCode: string;
  size?: number;
};

const EV_BADGE_LABELS: Record<string, string> = {
  '__ev_prerelease':  'PR',
  '__ev_treasurecup': 'TC',
  '__ev_regional':    'RG',
  '__ev_cs':          'CS',
  '__ev_tournament':  'TP',
  '__ev_store':       'SE',
  '__ev_collection':  'SC',
  '__ev_other':       'EV',
};

/** Parte el codigo en letras + numero. "OP16" -> ["OP","16"]. */
function splitCode(code: string): [string, string] {
  if (code in EV_BADGE_LABELS) return [EV_BADGE_LABELS[code], ''];
  const m = code.match(/^([A-Za-z]+)(\d*)$/);
  if (!m) return [code.slice(0, 4), ''];
  return [m[1], m[2]];
}

export function SetBadge({ setCode, size = 56 }: Props) {
  const [letters, number] = splitCode(setCode);
  return (
    <View
      style={[
        s.badge,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[s.letters, { fontSize: size * 0.27 }]}>{letters}</Text>
      {number ? (
        <Text style={[s.number, { fontSize: size * 0.34 }]}>{number}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: {
    fontFamily: fonts.uiBold,
    color: colors.textMut,
    letterSpacing: 0.5,
    lineHeight: undefined,
  },
  number: {
    fontFamily: fonts.display,
    color: colors.text,
    marginTop: -2,
  },
});
