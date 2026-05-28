// Pantalla de detalle: muestra todas las variantes de una carta y
// permite ajustar la cantidad en la colección y abrir Cardmarket.

import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { DetailScreenProps } from '../navigation';
import { CARDS } from '../data/loadIndex';
import { imageUrl } from '../lib/images';
import { adjust, getCount, subscribe } from '../lib/collection';
import { buildCardmarketSearchUrl } from '../lib/cardmarket';
import type { Variant } from '../types';

export function DetailScreen({ route }: DetailScreenProps) {
  const { code } = route.params;
  const card = CARDS[code];

  if (!card) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>No se encontró la carta {code}.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text style={styles.code}>{card.code}</Text>
      <Text style={styles.name}>{card.name}</Text>
      <Text style={styles.meta}>
        {card.variants.length} variante{card.variants.length === 1 ? '' : 's'}
      </Text>

      {card.variants.map((v) => (
        <VariantRow key={v.suffix || 'base'} code={card.code} variant={v} />
      ))}
    </ScrollView>
  );
}

function VariantRow({ code, variant }: { code: string; variant: Variant }) {
  const [count, setCountState] = useState(0);

  useEffect(() => {
    let alive = true;
    getCount(code, variant.suffix).then((n) => {
      if (alive) setCountState(n);
    });
    const unsub = subscribe(() => {
      getCount(code, variant.suffix).then((n) => {
        if (alive) setCountState(n);
      });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [code, variant.suffix]);

  const url = imageUrl(variant.image_local);

  return (
    <View style={styles.row}>
      <View style={styles.imgWrap}>
        {url ? (
          <Image source={{ uri: url }} style={styles.img} resizeMode="contain" />
        ) : (
          <View style={[styles.img, styles.imgFallback]}>
            <Text style={styles.imgFallbackText}>Sin imagen</Text>
          </View>
        )}
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.rowLabel}>{variant.label}</Text>
        <Text style={styles.rowRarity}>{variant.rarity || '—'}</Text>
        <Text style={styles.rowFullName} numberOfLines={2}>
          {variant.full_name}
        </Text>

        <View style={styles.counter}>
          <Pressable
            onPress={() => adjust(code, variant.suffix, -1)}
            style={styles.counterBtn}
          >
            <Text style={styles.counterBtnText}>−</Text>
          </Pressable>
          <Text style={styles.counterValue}>{count}</Text>
          <Pressable
            onPress={() => adjust(code, variant.suffix, +1)}
            style={styles.counterBtn}
          >
            <Text style={styles.counterBtnText}>+</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.cmBtn}
          onPress={() => Linking.openURL(buildCardmarketSearchUrl(code))}
        >
          <Text style={styles.cmBtnText}>Ver en Cardmarket ↗</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e1117' },
  error: { color: '#e74c3c', padding: 16 },
  code: { color: '#e6e9ef', fontSize: 22, fontWeight: '800' },
  name: { color: '#cfd3dc', fontSize: 16, marginBottom: 4 },
  meta: { color: '#8a93a6', fontSize: 12, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#1a1f29',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  imgWrap: {
    width: 110,
    aspectRatio: 600 / 838,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0e1117',
  },
  img: { width: '100%', height: '100%' },
  imgFallback: { alignItems: 'center', justifyContent: 'center' },
  imgFallbackText: { color: '#5b6478', fontSize: 11 },
  rowMeta: { flex: 1, paddingLeft: 12, justifyContent: 'space-between' },
  rowLabel: { color: '#e6e9ef', fontSize: 14, fontWeight: '700' },
  rowRarity: { color: '#8a93a6', fontSize: 12 },
  rowFullName: { color: '#cfd3dc', fontSize: 12, marginTop: 4 },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#2b3242',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: { color: '#e6e9ef', fontSize: 18, fontWeight: '700' },
  counterValue: {
    minWidth: 36,
    textAlign: 'center',
    color: '#e6e9ef',
    fontSize: 16,
    fontWeight: '700',
  },
  cmBtn: {
    marginTop: 8,
    backgroundColor: '#3a86ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  cmBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
