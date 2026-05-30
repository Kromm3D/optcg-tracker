// Detalle de carta. Adopta el look del handoff: hero con la imagen grande,
// chips de color/coste/poder/rareza, efecto, lista de variantes con
// contadores y boton de Cardmarket.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CachedImage } from '../components/CachedImage';
import type { DetailScreenProps } from '../navigation';
import { CARDS } from '../data/loadIndex';
import { colors, fonts, colorOf } from '../theme';
import { Icon } from '../components/Icon';
import { ColorDot } from '../components/ColorDot';
import { RarityPip } from '../components/RarityPip';
import { resolveImageUris } from '../lib/images';
import { adjust, getCount, subscribe as subColl } from '../lib/collection';
import { buildCardmarketSearchUrl } from '../lib/cardmarket';
import { isWished, toggleWish, subscribe as subWish } from '../lib/wishlist';
import type { Variant } from '../types';

export function DetailScreen({ route, navigation }: DetailScreenProps) {
  const { code } = route.params;
  const card = CARDS[code];
  const [wished, setWished] = useState(false);

  const refreshWish = useCallback(() => {
    isWished(code).then(setWished);
  }, [code]);

  useEffect(() => {
    refreshWish();
    return subWish(refreshWish);
  }, [refreshWish]);

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <Text style={{ color: colors.down }}>No se encontró la carta {code}.</Text>
      </View>
    );
  }

  const main = card.variants[0];
  const { uri: url, fallback: urlFallback } = main ? resolveImageUris(main) : { uri: '' };
  const tone = card.colors?.[0] ? colorOf(card.colors[0]) : colors.accent;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Close + heart */}
      <View style={s.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={s.topBtn}>
          <Icon name="close" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => toggleWish(code)} style={s.topBtn}>
          <Icon
            name="heart"
            size={20}
            color={wished ? colors.accent : colors.textMut}
          />
        </Pressable>
      </View>

      {/* Hero image */}
      <View style={s.heroWrap}>
        <View
          style={[
            s.heroGlow,
            { backgroundColor: tone + '22', shadowColor: tone },
          ]}
        />
        <View style={s.hero}>
          {url ? (
            <CachedImage uri={url} fallbackUri={urlFallback} style={s.heroImg} contentFit="contain" />
          ) : (
            <View style={[s.heroImg, s.heroFallback]}>
              <Text style={{ color: colors.textDim }}>{card.code}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Title block */}
      <View style={s.titleBlock}>
        <Text style={s.code}>{card.code}</Text>
        <Text style={s.name}>{card.name}</Text>

        <View style={s.chipRow}>
          {(card.colors ?? []).map((c) => (
            <View key={c} style={[s.chip, { borderColor: colorOf(c) + '88' }]}>
              <ColorDot colors={[c]} size={8} />
              <Text style={[s.chipText, { color: colorOf(c) }]}>{c}</Text>
            </View>
          ))}
          {card.type ? (
            <View style={s.chip}>
              <Text style={s.chipText}>{card.type}</Text>
            </View>
          ) : null}
          {card.cost !== null && card.cost !== undefined ? (
            <View style={s.chip}>
              <Text style={s.chipText}>Cost {card.cost}</Text>
            </View>
          ) : null}
          {card.power ? (
            <View style={s.chip}>
              <Text style={s.chipText}>Power {card.power.toLocaleString()}</Text>
            </View>
          ) : null}
          {card.counter ? (
            <View style={s.chip}>
              <Text style={s.chipText}>Counter {card.counter}</Text>
            </View>
          ) : null}
          {card.attribute ? (
            <View style={s.chip}>
              <Text style={s.chipText}>{card.attribute}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Effect text */}
      {card.effect ? (
        <View style={s.panel}>
          <Text style={s.panelLabel}>Effect</Text>
          <Text style={s.effect}>{card.effect}</Text>
        </View>
      ) : null}

      {/* Cardmarket button */}
      <Pressable
        style={s.cmBtn}
        onPress={() => Linking.openURL(buildCardmarketSearchUrl(code))}
      >
        <Text style={s.cmText}>Ver precio en Cardmarket</Text>
        <Icon name="external" size={16} color="#fff" />
      </Pressable>

      {/* Variants */}
      <View style={{ paddingHorizontal: 18, marginTop: 26 }}>
        <Text style={s.sectionTitle}>
          Variants · {card.variants.length}
        </Text>
        {card.variants.map((v) => (
          <VariantRow key={v.suffix || 'base'} code={code} variant={v} />
        ))}
      </View>
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
    const unsub = subColl(() => {
      getCount(code, variant.suffix).then((n) => {
        if (alive) setCountState(n);
      });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [code, variant.suffix]);

  const { uri: url, fallback: urlFallback } = resolveImageUris(variant);

  return (
    <View style={s.varRow}>
      <View style={s.varThumb}>
        {url ? (
          <CachedImage uri={url} fallbackUri={urlFallback} style={s.varImg} contentFit="contain" />
        ) : null}
      </View>
      <View style={s.varBody}>
        <Text style={s.varLabel}>{variant.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <RarityPip rarity={variant.rarity} />
          <Text style={s.varFull} numberOfLines={1}>
            {variant.full_name}
          </Text>
        </View>
        <View style={s.counter}>
          <Pressable
            onPress={() => adjust(code, variant.suffix, -1)}
            style={s.counterBtn}
          >
            <Icon name="minus" size={16} color={colors.text} />
          </Pressable>
          <Text style={s.counterValue}>{count}</Text>
          <Pressable
            onPress={() => adjust(code, variant.suffix, +1)}
            style={s.counterBtn}
          >
            <Icon name="plus" size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    alignItems: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    shadowOpacity: 0.8,
    shadowRadius: 60,
    top: 32,
  },
  hero: {
    width: '70%',
    aspectRatio: 600 / 838,
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { paddingHorizontal: 18, marginTop: 8 },
  code: {
    fontSize: 13,
    color: colors.textMut,
    fontFamily: fonts.uiSemi,
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 26,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
  },
  panel: {
    marginTop: 18,
    marginHorizontal: 18,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  panelLabel: {
    fontSize: 11,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  effect: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: colors.text,
    lineHeight: 20,
  },
  cmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  cmText: {
    fontSize: 14,
    fontFamily: fonts.uiBold,
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: fonts.uiBold,
    color: colors.text,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  varRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    gap: 12,
  },
  varThumb: {
    width: 70,
    aspectRatio: 600 / 838,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  varImg: { width: '100%', height: '100%' },
  varBody: { flex: 1, justifyContent: 'space-between' },
  varLabel: {
    fontSize: 14,
    fontFamily: fonts.uiBold,
    color: colors.text,
  },
  varFull: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    flex: 1,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  counterBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    minWidth: 30,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fonts.display,
    color: colors.text,
  },
});
