// Miniatura de carta. Imagen real con overlays: dot de color, nombre,
// rareza y badge de owned. Modo "compact" para 3+ columnas. Modo
// "quickActions" para mostrar +/- directamente sobre la card (afecta
// a la primera variante).

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CachedImage } from './CachedImage';
import { Icon } from './Icon';
import { colors, fonts } from '../theme';
import { resolveImageUris } from '../lib/images';
import { adjust, getCount, subscribe as subColl } from '../lib/collection';
import type { Card, Variant } from '../types';

type Props = {
  card: Card;
  /** Cuantas tienes (suma de variantes). Badge en la esquina. */
  owned?: number;
  /** Si true, recorta overlays (usar con 3-5 columnas). */
  compact?: boolean;
  /** Si true, muestra +/- en la parte de abajo y oculta el badge. */
  quickActions?: boolean;
  /** Si true, aplica una capa gris semitransparente (carta no poseída). */
  dimmed?: boolean;
  /** Set code where this variant was released, when it differs from the card's
   *  own set (e.g. "EB02" for Gold Leader parallels shown inside EB01). */
  sourceSet?: string;
  /** Si true, muestra un indicador de "varias artes poseídas". */
  multiArt?: boolean;
  /** Si true, dibuja un borde/overlay de selección (modo multi-select). */
  selected?: boolean;
  /** Explicit pixel width; overrides the default '100%' flex width. */
  width?: number;
  /** Override the variant used for image/display (default: variants[0]). */
  variant?: Variant;
  /** Inline +/- controls below the footer. qty = count shown between buttons. */
  onAdjust?: (delta: number) => void;
  /** Current count displayed in inline controls (when onAdjust is provided). */
  qty?: number;
  onPress?: () => void;
};

export function CardThumb({
  card,
  owned = 0,
  compact = false,
  quickActions = false,
  dimmed = false,
  sourceSet,
  multiArt = false,
  selected = false,
  width,
  variant,
  onAdjust,
  qty = 0,
  onPress,
}: Props) {
  const v = variant ?? card.variants[0];
  const { uri: primaryUrl, fallback: fallbackUrl } = v ? resolveImageUris(v) : { uri: '', fallback: undefined };

  // Para los +/- locales necesitamos el count de la primera variante
  const [vCount, setVCount] = useState(0);
  useEffect(() => {
    if (!quickActions || !v) return;
    let alive = true;
    getCount(card.code, v.suffix).then((n) => alive && setVCount(n));
    const unsub = subColl(() =>
      getCount(card.code, v.suffix).then((n) => alive && setVCount(n))
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [quickActions, card.code, v]);

  return (
    <Pressable onPress={onPress} style={[styles.wrap, width !== undefined && { width }]}>
      <View style={styles.imgWrap}>
        {primaryUrl ? (
          <CachedImage
            uri={primaryUrl}
            fallbackUri={fallbackUrl}
            style={styles.img}
            placeholderBg={colors.surface2}
          />
        ) : (
          <View style={[styles.img, styles.fallback]}>
            <Text style={styles.fallbackText}>{card.code}</Text>
          </View>
        )}

        {/* Dim overlay for missing cards. */}
        {dimmed && <View style={styles.dimOverlay} />}

        {/* Selection ring (multi-select mode). */}
        {selected && <View style={styles.selOverlay} />}

        {/* Multi-art indicator: owned across several art versions. */}
        {multiArt && (
          <View style={styles.multiArt}>
            <Icon name="layers" size={12} color="#fff" stroke={2} />
          </View>
        )}

        {/* Source-set badge: shown when this variant released in a different set. */}
        {sourceSet && (
          <View style={styles.sourceSetBadge}>
            <Text style={styles.sourceSetText}>{sourceSet}</Text>
          </View>
        )}

        {/* Quick actions: dos botones circulares grandes centrados abajo. */}
        {quickActions && v ? (
          <View style={styles.qa}>
            <Pressable
              onPress={(e: any) => {
                (e as any).stopPropagation?.();
                adjust(card.code, v.suffix, -1);
              }}
              style={styles.qaBtn}
            >
              <Text style={styles.qaSign}>−</Text>
            </Pressable>
            <Pressable
              onPress={(e: any) => {
                (e as any).stopPropagation?.();
                adjust(card.code, v.suffix, +1);
              }}
              style={styles.qaBtn}
            >
              <Text style={styles.qaSign}>+</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Count bubble — bleeds out of top-right corner of the image. */}
      {!quickActions && owned > 0 && (
        <View style={styles.countBubble}>
          <Text style={styles.countBubbleText}>×{owned}</Text>
        </View>
      )}

      {/* quickActions counter bubble */}
      {quickActions && vCount > 0 && (
        <View style={styles.countBubble}>
          <Text style={styles.countBubbleText}>×{vCount}</Text>
        </View>
      )}

      {/* Footer: card name bold + card ID below */}
      {!quickActions && (
        <View style={styles.footer}>
          <Text style={[styles.cardName, compact && styles.cardNameSm]} numberOfLines={1}>{card.name}</Text>
          <Text style={[styles.code, compact && styles.codeSm]} numberOfLines={1}>{card.code}</Text>
        </View>
      )}

      {/* Inline ±  controls — shown whenever onAdjust is provided */}
      {!quickActions && onAdjust && (
        <View style={styles.inlineControls}>
          <Pressable
            style={styles.inlineBtn}
            onPress={(e: any) => { (e as any).stopPropagation?.(); onAdjust(-1); }}
          >
            <Text style={styles.inlineSign}>−</Text>
          </Pressable>
          <Text style={styles.inlineQty}>{qty}</Text>
          <Pressable
            style={styles.inlineBtn}
            onPress={(e: any) => { (e as any).stopPropagation?.(); onAdjust(+1); }}
          >
            <Text style={styles.inlineSign}>+</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'visible' },
  imgWrap: {
    width: '100%',
    aspectRatio: 200 / 280,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    position: 'relative',
  },
  img: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: colors.textDim, fontSize: 12 },
  qa: {
    position: 'absolute',
    bottom: '12%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  qaBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(244,246,249,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaSign: { color: '#0d0f14', fontSize: 22, fontFamily: fonts.uiBold, lineHeight: 26 },
  // Bleeds slightly outside the top-right corner of the card image.
  countBubble: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  countBubbleText: { fontSize: 12, color: '#fff', fontFamily: fonts.uiBold },
  footer: { marginTop: 5, marginBottom: 2 },
  inlineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  inlineBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSign: { fontSize: 16, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 20 },
  inlineQty: {
    fontSize: 13,
    fontFamily: fonts.display,
    color: colors.text,
    minWidth: 16,
    textAlign: 'center',
  },
  cardName: { fontSize: 11, fontFamily: fonts.uiBold, color: colors.text, lineHeight: 14 },
  cardNameSm: { fontSize: 9.5 },
  code: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut, lineHeight: 13 },
  codeSm: { fontSize: 8.5 },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(14,12,26,0.65)',
  },
  selOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 14,
    backgroundColor: colors.accentDim,
  },
  multiArt: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  sourceSetBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(14,12,26,0.78)',
    zIndex: 10,
  },
  sourceSetText: { fontSize: 9, fontFamily: fonts.uiBold, color: '#fff', letterSpacing: 0.3 },
});
