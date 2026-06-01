// Fila compacta de carta para listas verticales (Home recent, Detail
// variants alternativas...).

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CachedImage } from './CachedImage';
import { colors, fonts } from '../theme';
import { ColorDot } from './ColorDot';
import { RarityPip } from './RarityPip';
import { resolveImageUris } from '../lib/images';
import type { Card } from '../types';

type Props = {
  card: Card;
  right?: React.ReactNode;
  onPress?: () => void;
};

export function CardRow({ card, right, onPress }: Props) {
  const v = card.variants[0];
  const { uri: url, fallback: urlFallback } = v ? resolveImageUris(v) : { uri: '', fallback: undefined };
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.thumb}>
        {url ? (
          <CachedImage uri={url} fallbackUri={urlFallback} style={styles.img} />
        ) : null}
      </View>
      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <ColorDot colors={card.colors} size={7} />
          <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.code}>{card.code}</Text>
          <RarityPip rarity={v?.rarity ?? ''} />
        </View>
      </View>
      {right ?? null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    gap: 12,
  },
  thumb: {
    width: 42,
    height: 59,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  img: { width: '100%', height: '100%' },
  middle: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    fontSize: 14.5,
    fontFamily: fonts.display,
    color: colors.text,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  code: {
    fontSize: 11.5,
    fontFamily: fonts.ui,
    color: colors.textDim,
  },
});
