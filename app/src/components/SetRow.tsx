// Fila de set en SetsScreen: la misma cápsula que SetBanner (arte enmascarado
// a la derecha, ≥50% del ancho en cualquier resolución), pero con el desglose
// de rarezas integrado DENTRO de la cápsula (en vez de vivir como fila aparte,
// como ocurre hoy en SetDetail) y dimensionada para una lista, no un header.

import React, { useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Image as SvgImage, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';
import { Touchable } from './Touchable';
import { ProgressRing } from './ProgressRing';
import { hasBoxArt, boxArtUrl } from '../lib/setBoxArt';
import { setNameFor } from '../lib/setMeta';
import { COLOR_KEYS, OPTCG_COLORS, colors, fonts } from '../theme';
import type { SetSummary, RarityBucket } from '../lib/setsStats';

type Props = {
  summary: SetSummary;
  rarities: RarityBucket[];
  onPress: () => void;
};

const ROW_H = 150;
const ART_FRACTION = 0.72;
const ART_MAX_W = 480;

function fallbackToneFor(setCode: string): string {
  let hash = 0;
  for (let i = 0; i < setCode.length; i++) hash = (hash * 31 + setCode.charCodeAt(i)) >>> 0;
  const key = COLOR_KEYS[hash % COLOR_KEYS.length];
  return OPTCG_COLORS[key]?.tone ?? colors.surface2;
}

export function SetRow({ summary, rarities, onPress }: Props) {
  const { code, owned, total, pct } = summary;
  const hasArt = hasBoxArt(code);
  const fallbackTone = hasArt ? undefined : fallbackToneFor(code);

  // Ancho medido del propio contenedor (no de la ventana): esta fila vive
  // anidada bajo el padding del scroll + el padding de la tarjeta de familia,
  // así que el ancho real no es deducible de useWindowDimensions como en
  // SetBanner (que es full-bleed). onLayout da el ancho exacto sea cual sea
  // el anidamiento.
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  // Suelo del 50%: el arte nunca debe ocupar menos de la mitad de la cápsula,
  // sin importar la resolución; el cap absoluto solo evita pixelado en
  // pantallas muy anchas.
  const artW = Math.max(Math.round(w * 0.5), Math.min(Math.round(w * ART_FRACTION), ART_MAX_W));
  const artX = w - artW;

  return (
    <Touchable style={s.capsule} onLayout={onLayout} onPress={onPress} hitSlopOn={false} accessibilityRole="button" accessibilityLabel={`${setNameFor(code)}, ${pct}%`}>
      {/* Capa de arte enmascarada — mismo tratamiento que SetBanner. */}
      {w > 0 ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={w} height={ROW_H}>
          <Defs>
            <LinearGradient id={`rowArtFade-${code}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#fff" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#fff" stopOpacity={0.55} />
              <Stop offset="0.82" stopColor="#fff" stopOpacity={1} />
              <Stop offset="1" stopColor="#fff" stopOpacity={1} />
            </LinearGradient>
            <Mask id={`rowArtMask-${code}`}>
              <Rect x={artX} y={0} width={artW} height={ROW_H} fill={`url(#rowArtFade-${code})`} />
            </Mask>
            <LinearGradient id={`rowArtScrim-${code}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surface2} stopOpacity={0.92} />
              <Stop offset="0.42" stopColor={colors.surface2} stopOpacity={0.5} />
              <Stop offset="0.66" stopColor={colors.surface2} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {hasArt ? (
            <SvgImage
              href={{ uri: boxArtUrl(code) }}
              x={artX}
              y={0}
              width={artW}
              height={ROW_H}
              preserveAspectRatio="xMidYMin slice"
              mask={`url(#rowArtMask-${code})`}
            />
          ) : (
            <Rect x={artX} y={0} width={artW} height={ROW_H} fill={fallbackTone} mask={`url(#rowArtMask-${code})`} />
          )}

          <Rect x={0} y={0} width={w} height={ROW_H} fill={`url(#rowArtScrim-${code})`} />
        </Svg>
      </View>
      ) : null}

      {/* Contenido: cabecera (ring + código + título + progreso) y, debajo,
          el desglose por rareza dentro de la misma cápsula. */}
      <View style={s.content}>
        <View style={s.headRow}>
          <ProgressRing pct={pct} size={40} stroke={4} />
          <View style={{ flex: 1 }}>
            <Text style={s.code}>{code}</Text>
            <Text style={s.title} numberOfLines={1}>{setNameFor(code)}</Text>
          </View>
          <Text style={s.count}>{owned}/{total}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.rarityScroll}
          contentContainerStyle={s.rarityRow}
        >
          {rarities.map((b) => (
            <View key={b.rarity} style={s.rarityCol}>
              <Text style={s.rarityVal}>{b.owned}/{b.total}</Text>
              <Text style={s.rarityLab}>{b.rarity}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Touchable>
  );
}

const s = StyleSheet.create({
  capsule: {
    height: ROW_H,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 96,
    gap: 10,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  code: { fontSize: 18, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.3 },
  title: { fontSize: 11.5, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 1 },
  count: { fontSize: 12, fontFamily: fonts.uiBold, color: colors.ghost },
  rarityScroll: { flexGrow: 0 },
  rarityRow: { alignItems: 'center', gap: 14 },
  rarityCol: { alignItems: 'center', minWidth: 30 },
  rarityVal: { fontSize: 12.5, fontFamily: fonts.display, color: colors.text },
  rarityLab: { fontSize: 9.5, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 2 },
});
