// DeckCardPile — shows up to `qty` card thumbnails stacked with slight offsets.
// Copies the user doesn't own yet are rendered with the dimmed overlay.
// A fraction badge "owned/qty" appears top-right when copies are missing.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CachedImage } from './CachedImage';
import { colors, fonts } from '../theme';
import { resolveImageUris } from '../lib/images';
import type { Card } from '../types';

interface Props {
  card: Card;
  /** How many copies this deck slot requires. */
  qty: number;
  /** How many copies the user owns (from ownedAggregate). */
  owned: number;
  /** Width of the bottom card in the pile (height auto from aspect). */
  width: number;
}

const ASPECT = 200 / 280;
const MAX_VISIBLE = 4; // render at most 4 layers
const OFFSET_Y = 6;   // px each card shifts upward in the pile
const OFFSET_X = 3;   // px each card shifts right in the pile

export function DeckCardPile({ card, qty, owned, width }: Props) {
  const v = card.variants[0];
  const { uri, fallback: fallbackUri } = v ? resolveImageUris(v) : { uri: '', fallback: undefined };
  const height = width / ASPECT;

  const layers = Math.min(qty, MAX_VISIBLE);
  const stackH = height + OFFSET_Y * (layers - 1);
  const stackW = width  + OFFSET_X * (layers - 1);

  const hasMissing = owned < qty;
  const fraction = `${Math.min(owned, qty)}/${qty}`;

  return (
    <View style={{ width: stackW, height: stackH }}>
      {Array.from({ length: layers }).map((_, i) => {
        // i=0 is the back of the pile, i=layers-1 is the front
        const isMissing = i >= owned; // this layer represents a copy you don't have
        const offsetTop  = (layers - 1 - i) * OFFSET_Y;
        const offsetLeft = i * OFFSET_X;

        return (
          <View
            key={i}
            style={[
              styles.layer,
              {
                width,
                height,
                top: offsetTop,
                left: offsetLeft,
                zIndex: i,
              },
            ]}
          >
            {uri ? (
              <CachedImage
                uri={uri}
                fallbackUri={fallbackUri}
                style={styles.img}
                placeholderBg={colors.surface2}
              />
            ) : (
              <View style={[styles.img, styles.fallback]}>
                <Text style={styles.fallbackText}>{card.code}</Text>
              </View>
            )}
            {/* Dim overlay for missing copies */}
            {isMissing && <View style={styles.dim} />}
          </View>
        );
      })}

      {/* Fraction badge — only shown when some copies are missing */}
      {hasMissing && (
        <View style={[styles.badge, { top: 4, right: 0, zIndex: layers + 1 }]}>
          <Text style={styles.badgeText}>{fraction}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  img: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: colors.textDim, fontSize: 10 },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(14,12,26,0.65)',
  },
  badge: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.uiBold,
    color: colors.textMut,
  },
});
