// Share preview modal: renders a captureable grid of cards (wishlist or trade)
// with a title, and a "Share image" button that exports it to a PNG via the OS
// share sheet (lib/shareImage). Each card may show an optional qty badge.

import React, { useRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from './CachedImage';
import { Icon } from './Icon';
import { resolveImageUris } from '../lib/images';
import { captureAndShare } from '../lib/shareImage';
import { useT } from '../lib/i18n';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import type { Card } from '../types';

export type ShareSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  cards: Card[];
  /** Optional badge (e.g. tradeable count) per card code. */
  qtyFor?: (code: string) => number;
};

export function ShareSheet({ visible, onClose, title, cards, qtyFor }: ShareSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const captureRef = useRef<View>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Text style={s.headerTitle}>{title}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <Icon name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          {/* Capture target */}
          <View ref={captureRef} collapsable={false} style={s.capture}>
            <Text style={s.captureTitle}>{title}</Text>
            <Text style={s.captureSub}>{t('wl.cardsCount', { n: cards.length })}</Text>
            <View style={s.grid}>
              {cards.map((c) => {
                const v = c.variants[0];
                const { uri, fallback } = v ? resolveImageUris(v) : { uri: '', fallback: undefined };
                const qty = qtyFor?.(c.code) ?? 0;
                return (
                  <View key={c.code} style={s.cell}>
                    {uri ? (
                      <CachedImage uri={uri} fallbackUri={fallback} style={s.cellImg} />
                    ) : (
                      <View style={[s.cellImg, s.cellFallback]}>
                        <Text style={s.cellCode}>{c.code}</Text>
                      </View>
                    )}
                    {qty > 0 && (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>×{qty}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        <Pressable
          style={({ pressed }) => [s.shareBtn, { paddingBottom: insets.bottom + 14 }, pressed && pressedStyle]}
          onPress={() => captureAndShare(captureRef)}
          accessibilityRole="button"
          accessibilityLabel={t('binder.shareImage')}
        >
          <Icon name="external" size={18} color="#fff" />
          <Text style={s.shareBtnText}>{t('binder.shareImage')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  capture: { backgroundColor: colors.bg, padding: 12, borderRadius: radii.lg },
  captureTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  captureSub: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 70, height: 98, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface2 },
  cellImg: { width: '100%', height: '100%' },
  cellFallback: { alignItems: 'center', justifyContent: 'center' },
  cellCode: { fontSize: 8, color: colors.textDim, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 10, fontFamily: fonts.uiBold, color: '#fff' },
  shareBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingTop: 14,
  },
  shareBtnText: { fontSize: 16, fontFamily: fonts.uiBold, color: '#fff' },
});
