// BulkActionBar — sticky bottom bar shown while a multi-select session is
// active. Reports the selection count and offers the four bulk targets.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';

export type BulkTarget = 'collection' | 'wishlist' | 'trade' | 'deck';

type Props = {
  count: number;
  onClear: () => void;
  onPick: (target: BulkTarget) => void;
  /** Extra space below the bar (e.g. to clear a floating tab bar). */
  bottomGap?: number;
};

const TARGETS: Array<{ key: BulkTarget; icon: string; labelKey: 'bulk.toCollection' | 'bulk.toWishlist' | 'bulk.toTrade' | 'bulk.toDeck' }> = [
  { key: 'collection', icon: 'binder', labelKey: 'bulk.toCollection' },
  { key: 'wishlist', icon: 'heart', labelKey: 'bulk.toWishlist' },
  { key: 'trade', icon: 'swap', labelKey: 'bulk.toTrade' },
  { key: 'deck', icon: 'layers', labelKey: 'bulk.toDeck' },
];

export function BulkActionBar({ count, onClear, onPick, bottomGap = 0 }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  if (count === 0) return null;
  return (
    <View style={[s.wrap, { paddingBottom: insets.bottom + 10 + bottomGap }]}>
      <View style={s.bar}>
        <View style={s.head}>
          <Text style={s.count}>{t('bulk.selected', { n: count })}</Text>
          <Pressable
            onPress={onClear}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('bulk.clear')}
            style={({ pressed }) => pressed && pressedStyle}
          >
            <Text style={s.clear}>{t('bulk.clear')}</Text>
          </Pressable>
        </View>
        <View style={s.actions}>
          {TARGETS.map((tg) => (
            <Pressable
              key={tg.key}
              style={({ pressed }) => [s.action, pressed && pressedStyle]}
              onPress={() => onPick(tg.key)}
              accessibilityRole="button"
              accessibilityLabel={t(tg.labelKey)}
            >
              <Icon name={tg.icon} size={18} color={colors.accent} />
              <Text style={s.actionLabel}>{t(tg.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  bar: {
    backgroundColor: 'rgba(21,18,38,0.97)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 12,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 14, fontFamily: fonts.uiBold, color: colors.text },
  clear: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.text },
});
