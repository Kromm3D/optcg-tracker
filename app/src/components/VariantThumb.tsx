// Miniatura clicable de una variante de carta.
// Se reutiliza en la pantalla de búsqueda y en la de colección.

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Variant } from '../types';
import { imageUrl } from '../lib/images';

type Props = {
  variant: Variant;
  code: string;
  cardName: string;
  /** Si está marcada en colección, muestra un badge con la cantidad. */
  count?: number;
  onPress?: () => void;
};

export function VariantThumb({ variant, code, cardName, count, onPress }: Props) {
  const url = imageUrl(variant.image_local);
  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <View style={styles.imgWrap}>
        {url ? (
          <Image source={{ uri: url }} style={styles.img} resizeMode="contain" />
        ) : (
          <View style={[styles.img, styles.imgFallback]}>
            <Text style={styles.imgFallbackText}>{code}</Text>
          </View>
        )}
        {count && count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>×{count}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.code}>{code}</Text>
      <Text numberOfLines={1} style={styles.label}>{variant.label}</Text>
      <Text numberOfLines={1} style={styles.name}>{cardName}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 130, marginRight: 12, marginBottom: 16 },
  imgWrap: {
    aspectRatio: 600 / 838,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1f29',
    position: 'relative',
  },
  img: { width: '100%', height: '100%' },
  imgFallback: { alignItems: 'center', justifyContent: 'center' },
  imgFallbackText: { color: '#8a93a6', fontSize: 12 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  code: { color: '#e6e9ef', fontSize: 12, fontWeight: '700', marginTop: 6 },
  label: { color: '#8a93a6', fontSize: 11 },
  name: { color: '#cfd3dc', fontSize: 11 },
});
