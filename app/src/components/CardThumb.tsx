// Miniatura de carta. Imagen real con overlays: dot de color, nombre,
// rareza y badge de owned. Modo "compact" para 3+ columnas. Modo
// "quickActions" para mostrar +/- directamente sobre la card (afecta
// a la primera variante).

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CachedImage } from './CachedImage';
import { colors, fonts } from '../theme';
import { ColorDot } from './ColorDot';
import { RarityPip } from './RarityPip';
import { resolveImageUris } from '../lib/images';
import { adjust, getCount, subscribe as subColl } from '../lib/collection';
import type { Card } from '../types';

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
  /** Explicit pixel width; overrides the default '100%' flex width. */
  width?: number;
  onPress?: () => void;
};

export function CardThumb({
  card,
  owned = 0,
  compact = false,
  quickActions = false,
  dimmed = false,
  width,
  onPress,
}: Props) {
  const v = card.variants[0];
  const { uri: primaryUrl, fallback: fallbackUrl } = v ? resolveImageUris(v) : { uri: '' };

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

        {(!compact || quickActions) && (
          <View style={styles.topLeft}>
            <ColorDot colors={card.colors} size={8} />
            <Text style={styles.topName} numberOfLines={1}>{card.name}</Text>
          </View>
        )}

        {(!compact || quickActions) && card.cost !== null && card.cost !== undefined && card.type !== 'Event' && (
          <View style={styles.cost}>
            <Text style={styles.costText}>{card.cost}</Text>
          </View>
        )}

        {/* badge owned arriba a la derecha (no en modo quickActions). */}
        {!quickActions && (owned > 0 ? (
          <View style={[styles.ownedBadge, compact && styles.badgeSm]}>
            <Text style={[styles.ownedText, compact && styles.badgeSmText]}>x{owned}</Text>
          </View>
        ) : compact ? null : (
          <View style={styles.zeroBadge}>
            <Text style={styles.zeroText}>0</Text>
          </View>
        ))}

        {/* Poder arriba a la derecha (estilo referencia). */}
        {quickActions && card.power ? (
          <Text style={styles.powerTop}>{card.power.toLocaleString()}</Text>
        ) : null}

        {!compact && !quickActions && (
          <View style={styles.bottomBar}>
            <RarityPip rarity={v?.rarity ?? ''} />
            {card.power ? (
              <Text style={styles.power}>{card.power.toLocaleString()}</Text>
            ) : null}
          </View>
        )}

        {/* Dim overlay for missing cards. */}
        {dimmed && (
          <View style={styles.dimOverlay} />
        )}

        {/* Quick actions: dos botones circulares grandes centrados abajo. */}
        {quickActions && v ? (
          <View style={styles.qa}>
            <Pressable
              onPress={(e) => {
                (e as any).stopPropagation?.();
                adjust(card.code, v.suffix, -1);
              }}
              style={styles.qaBtn}
            >
              <Text style={styles.qaSign}>−</Text>
            </Pressable>
            <Pressable
              onPress={(e) => {
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

      {/* Burbuja-contador roja que desborda la esquina superior derecha. */}
      {quickActions ? (
        <View style={styles.countBubble}>
          <Text style={styles.countBubbleText}>{vCount}</Text>
        </View>
      ) : null}

      {!quickActions && (
        <Text style={[styles.code, compact && styles.codeSm]} numberOfLines={1}>{card.code}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
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
  topLeft: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 38,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topName: {
    marginLeft: 5,
    fontSize: 11,
    fontFamily: fonts.display,
    color: '#fff',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cost: {
    position: 'absolute',
    top: 30,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: 'rgba(5,7,10,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  costText: { fontSize: 12, color: '#fff', fontFamily: fonts.display },
  ownedBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 99,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedText: { fontSize: 11, color: '#0a0c10', fontFamily: fonts.uiBold },
  zeroBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 99,
    backgroundColor: 'rgba(5,7,10,0.75)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zeroText: { fontSize: 11, color: colors.textDim, fontFamily: fonts.uiSemi },
  bottomBar: {
    position: 'absolute',
    bottom: 7,
    left: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  power: {
    fontSize: 12,
    color: '#fff',
    fontFamily: fonts.display,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  powerTop: {
    position: 'absolute',
    top: 7,
    right: 9,
    fontSize: 13,
    color: '#fff',
    fontFamily: fonts.display,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
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
  countBubble: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 30,
    height: 30,
    paddingHorizontal: 7,
    borderRadius: 15,
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  countBubbleText: { fontSize: 13, color: '#fff', fontFamily: fonts.uiBold },
  code: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 6 },
  codeSm: { fontSize: 9.5, marginTop: 4 },
  badgeSm: { minWidth: 16, height: 16, paddingHorizontal: 4, top: 4, right: 4 },
  badgeSmText: { fontSize: 9 },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,12,26,0.65)',
    // Slight desaturation effect via opacity — image is still visible but muted
  },
});
