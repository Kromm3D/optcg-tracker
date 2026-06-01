// VariantPickerSheet — shown when user taps a card in the wishlist.
// Shows all variants of the card with per-variant qty steppers.
// Default variant (suffix "") = base/non-parallel. Tap any row to set needed.

import React, { useEffect, useState } from 'react';
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
import { colors, fonts, radii, spacing } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import { resolveImageUris } from '../lib/images';
import {
  getWishlist,
  setNeeded,
  removeCard,
  wishCardKey,
} from '../lib/wishlists';
import type { Card, Wishlist, WishlistCard } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  card: Card | null;
  wishlistId: string;
};

export function VariantPickerSheet({ visible, onClose, card, wishlistId }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  // Local copy of needed counts, keyed by suffix
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Load current wishlist state
  useEffect(() => {
    if (!visible || !card) return;
    getWishlist(wishlistId).then((wl) => {
      if (!wl) return;
      const init: Record<string, number> = {};
      for (const v of card.variants) {
        const entry = wl.cards[wishCardKey(card.code, v.suffix)];
        init[v.suffix] = entry?.needed ?? 0;
      }
      setCounts(init);
    });
  }, [visible, card, wishlistId]);

  const handleChange = (suffix: string, delta: number) => {
    setCounts((prev) => {
      const next = Math.max(0, (prev[suffix] ?? 0) + delta);
      return { ...prev, [suffix]: next };
    });
  };

  const handleConfirm = async () => {
    if (!card) return;
    for (const v of card.variants) {
      const needed = counts[v.suffix] ?? 0;
      if (needed > 0) {
        await setNeeded(wishlistId, card.code, v.suffix, needed);
      } else {
        await removeCard(wishlistId, card.code, v.suffix);
      }
    }
    onClose();
  };

  if (!card) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('wl.variantTitle')}</Text>
          <Text style={s.subtitle}>{card.name} · {card.code}</Text>

          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {card.variants.map((v) => {
              const { uri, fallback } = resolveImageUris(v);
              const count = counts[v.suffix] ?? 0;
              const isDefault = v.suffix === '' || v.suffix === card.variants[0]?.suffix;
              return (
                <View key={v.suffix} style={[s.row, count > 0 && s.rowActive]}>
                  {/* Thumbnail */}
                  <View style={s.thumb}>
                    {uri ? (
                      <CachedImage uri={uri} fallbackUri={fallback} style={s.thumbImg} />
                    ) : (
                      <View style={[s.thumbImg, s.thumbFallback]}>
                        <Text style={s.thumbCode}>{card.code}</Text>
                      </View>
                    )}
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={s.varLabel}>{v.label || t('wl.normal')}</Text>
                    <View style={s.chips}>
                      <View style={s.chip}><Text style={s.chipTxt}>{v.rarity}</Text></View>
                      {isDefault && (
                        <View style={[s.chip, s.chipDefault]}>
                          <Text style={[s.chipTxt, { color: colors.accent }]}>Default</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Stepper */}
                  <View style={s.stepper}>
                    <Pressable style={s.stepBtn} onPress={() => handleChange(v.suffix, -1)}>
                      <Text style={s.stepSign}>−</Text>
                    </Pressable>
                    <Text style={[s.stepVal, count > 0 && s.stepValActive]}>{count}</Text>
                    <Pressable style={s.stepBtn} onPress={() => handleChange(v.suffix, +1)}>
                      <Text style={s.stepSign}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <Pressable style={s.confirmBtn} onPress={handleConfirm}>
            <Text style={s.confirmText}>{t('wl.confirm')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,12,26,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 14,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4,
  },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 10,
  },
  rowActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  thumb: { width: 48, height: 67, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface },
  thumbImg: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbCode: { fontSize: 8, color: colors.textDim, textAlign: 'center' },
  varLabel: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.text },
  chips: { flexDirection: 'row', gap: 6, marginTop: 4 },
  chip: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipDefault: { borderColor: colors.accent, backgroundColor: 'transparent' },
  chipTxt: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepSign: { fontSize: 18, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 22 },
  stepVal: { fontSize: 16, fontFamily: fonts.display, color: colors.textMut, minWidth: 20, textAlign: 'center' },
  stepValActive: { color: colors.accent },
  confirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
});
