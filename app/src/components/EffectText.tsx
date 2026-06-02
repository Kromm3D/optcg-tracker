// EffectText — renderiza el texto de efecto OPTCG con chips de color
// para cada [Etiqueta] siguiendo el estilo de cardkaizoku.com.
// En React Native los chips se implementan como <Text> inline con
// backgroundColor; no hay border-radius sobre texto inline, pero el
// resultado es legible y coherente con la paleta del juego.

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fonts, colors } from '../theme';

type Token = { type: 'text'; v: string } | { type: 'label'; v: string };

function tokenize(effect: string): Token[] {
  return effect
    .split(/(\[[^\]]+\])/g)
    .filter(Boolean)
    .map((p) =>
      p.startsWith('[') && p.endsWith(']')
        ? { type: 'label', v: p.slice(1, -1) }
        : { type: 'text', v: p },
    );
}

type ChipColor = { bg: string; fg: string };

function chipColor(label: string): ChipColor {
  const l = label.toLowerCase();

  // Timing / activation — violet
  if (
    /^(activate:|when attacking|on play|on k\.o|end of turn|on opponent|on your opponent|on block)/.test(l)
  ) return { bg: '#5b21b6', fg: '#ede9fe' };

  // Keyword abilities — red
  if (
    /^(rush|blocker|double attack|banish|infiltrate|cleave|boon|eternal|pinnacle|trash bin|barrier)/.test(l)
  ) return { bg: '#991b1b', fg: '#fecaca' };

  // Passive conditions — teal
  if (/^(once per turn|opponent's turn|your turn|choose 1)/.test(l))
    return { bg: '#0f766e', fg: '#99f6e4' };

  // DON!! cost — amber
  if (/^don!!/.test(l))
    return { bg: '#92400e', fg: '#fde68a' };

  // Trigger — green
  if (/^(trigger|counter)/.test(l))
    return { bg: '#166534', fg: '#bbf7d0' };

  // Default — dark accent
  return { bg: '#3730a3', fg: '#c7d2fe' };
}

type Props = { text: string; fontSize?: number };

export function EffectText({ text, fontSize = 14 }: Props) {
  const tokens = tokenize(text);
  return (
    <Text style={[s.body, { fontSize, lineHeight: fontSize * 1.65 }]}>
      {tokens.map((tok, i) => {
        if (tok.type === 'text') return tok.v;
        const c = chipColor(tok.v);
        return (
          <Text
            key={i}
            style={[s.chip, { backgroundColor: c.bg, color: c.fg }]}
          >
            {' '}{tok.v}{' '}
          </Text>
        );
      })}
    </Text>
  );
}

const s = StyleSheet.create({
  body: {
    fontFamily: fonts.ui,
    color: colors.text,
  },
  chip: {
    fontFamily: fonts.uiBold,
    fontSize: 12,
  },
});
