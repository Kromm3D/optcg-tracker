// Fila de mazo en DecksScreen: misma cápsula con arte enmascarado que
// SetBanner/SetRow, pero con la carta Líder del mazo (enfocada al centro, no
// arriba — el rostro del líder suele estar centrado, no en la parte alta como
// el key art de un set) en vez de key art de set.

import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Image as SvgImage, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';
import { Touchable } from './Touchable';
import { Icon } from './Icon';
import { CARDS } from '../data/loadIndex';
import { resolveImageUris } from '../lib/images';
import { colors, fonts, radii, HIT_SLOP, pressedStyle } from '../theme';
import type { Deck } from '../lib/decks';

type Props = {
  deck: Deck;
  subtitle: string;
  onPress: () => void;
  onLongPress: () => void;
  onMenuPress: () => void;
};

const ROW_H = 112;
const ART_FRACTION = 0.62;
const ART_MAX_W = 320;

/** URI del arte de la carta Líder del mazo, o null si no hay líder asignado. */
function leaderArtUri(deck: Deck): string | null {
  const leaderCode =
    deck.leaderId ?? deck.cards.find((dc) => CARDS[dc.code]?.type === 'Leader')?.code;
  if (!leaderCode) return null;
  const card = CARDS[leaderCode];
  const v = card?.variants[0];
  if (!v) return null;
  return resolveImageUris(v).uri || null;
}

export function DeckRow({ deck, subtitle, onPress, onLongPress, onMenuPress }: Props) {
  const art = leaderArtUri(deck);

  // Ancho medido del propio contenedor — mismo motivo que SetRow: esta fila
  // vive anidada bajo el padding de la lista, useWindowDimensions no sirve.
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const artW = Math.max(Math.round(w * 0.5), Math.min(Math.round(w * ART_FRACTION), ART_MAX_W));
  const artX = w - artW;

  return (
    // El botón de menú es hermano de la capa de pulsación principal, no su
    // descendiente: en web ambos renderizan <button>, y anidar <button>
    // dentro de <button> rompe la hidratación de React DOM.
    <View style={s.capsule} onLayout={onLayout}>
      <Touchable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        onLongPress={onLongPress}
        feedback="surface"
        hitSlopOn={false}
        accessibilityRole="button"
        accessibilityLabel={deck.name}
      >
        {w > 0 && art ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={w} height={ROW_H}>
              <Defs>
                <LinearGradient id={`deckArtFade-${deck.id}`} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                  <Stop offset="0.5" stopColor="#fff" stopOpacity={0.55} />
                  <Stop offset="0.82" stopColor="#fff" stopOpacity={1} />
                  <Stop offset="1" stopColor="#fff" stopOpacity={1} />
                </LinearGradient>
                <Mask id={`deckArtMask-${deck.id}`}>
                  <Rect x={artX} y={0} width={artW} height={ROW_H} fill={`url(#deckArtFade-${deck.id})`} />
                </Mask>
                <LinearGradient id={`deckArtScrim-${deck.id}`} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={colors.surface2} stopOpacity={0.92} />
                  <Stop offset="0.42" stopColor={colors.surface2} stopOpacity={0.5} />
                  <Stop offset="0.66" stopColor={colors.surface2} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              <SvgImage
                href={{ uri: art }}
                x={artX}
                y={0}
                width={artW}
                height={ROW_H}
                preserveAspectRatio="xMidYMid slice"
                mask={`url(#deckArtMask-${deck.id})`}
              />
              <Rect x={0} y={0} width={w} height={ROW_H} fill={`url(#deckArtScrim-${deck.id})`} />
            </Svg>
          </View>
        ) : null}

        <View style={s.content}>
          <Text style={s.name} numberOfLines={1}>{deck.name}</Text>
          <Text style={s.meta}>{subtitle}</Text>
        </View>
      </Touchable>

      <Pressable
        onPress={onMenuPress}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        style={({ pressed }) => [s.menuBtn, pressed && pressedStyle]}
      >
        <Icon name="dots" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  capsule: {
    height: ROW_H,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 80,
  },
  name: { fontSize: 17, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.3 },
  meta: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 3 },
  menuBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(19,16,25,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
