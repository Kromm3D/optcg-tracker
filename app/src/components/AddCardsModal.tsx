// Shared "Add Cards" search modal. Used by the deck editor (caps qty at 4) and
// by the Binder collection (+ button, increments owned copies). The host
// supplies how to read the current qty and how to apply a delta.

import React, { useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from './CachedImage';
import { Icon } from './Icon';
import { CARD_LIST } from '../data/loadIndex';
import { fuzzyFilter } from '../lib/filters';
import { resolveImageUris } from '../lib/images';
import { getOwnedFor } from '../lib/ownedAggregate';
import { useT } from '../lib/i18n';
import { Counter } from './Counter';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';

export type AddCardsModalProps = {
  visible: boolean;
  onClose: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Current qty shown for a card (deck qty, or owned copies). */
  getQty: (code: string) => number;
  /** Apply a delta (+1 / -1) for a card code. */
  onChange: (code: string, delta: number) => void;
};

export function AddCardsModal({
  visible,
  onClose,
  search,
  onSearchChange,
  getQty,
  onChange,
}: AddCardsModalProps) {
  const t = useT();
  const insets = useSafeAreaInsets();

  const searchResults = useMemo(() => {
    const base = search.trim() ? fuzzyFilter(CARD_LIST, search) : CARD_LIST;
    return base.slice(0, 60);
  }, [search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={[s.addHeader, { paddingTop: insets.top + 12 }]}>
          <Text style={s.addTitle}>{t('add.title')}</Text>
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
        <View style={s.searchWrap}>
          <Icon name="search" size={18} color={colors.textMut} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={onSearchChange}
            placeholder={t('add.searchPlaceholder')}
            placeholderTextColor={colors.textDim}
            autoFocus
          />
        </View>
        <FlatList
          data={searchResults}
          keyExtractor={(c) => c.code}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, paddingTop: 8 }}
          renderItem={({ item }) => {
            const qty = getQty(item.code);
            const owned = getOwnedFor(item.code);
            const v = item.variants[0];
            const { uri: imgUri, fallback } = v ? resolveImageUris(v) : { uri: '', fallback: undefined };
            return (
              <View style={s.addRow}>
                <View style={s.addThumb}>
                  {imgUri ? (
                    <CachedImage uri={imgUri} fallbackUri={fallback} style={s.addThumbImg} />
                  ) : (
                    <View style={[s.addThumbImg, s.addThumbFallback]}>
                      <Text style={s.addThumbCode}>{item.code}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.addName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.addMeta} numberOfLines={1}>
                    {item.code}{item.colors?.length ? ` · ${item.colors.join('/')}` : ''}{item.type ? ` · ${item.type}` : ''}
                  </Text>
                  <Text style={s.addOwned}>{t('add.owned')}: {owned}</Text>
                </View>
                <View style={s.addControls}>
                  <Counter
                    value={qty}
                    onAdjust={(d) => onChange(item.code, d)}
                    min={0}
                    size="sm"
                    label={item.code}
                  />
                </View>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  addHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
  },
  addTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.ui, color: colors.text },
  addRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  addThumb: {
    width: 48,
    height: 67,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    flexShrink: 0,
  },
  addThumbImg: { width: '100%', height: '100%' },
  addThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  addThumbCode: { fontSize: 8, color: colors.textDim, textAlign: 'center' },
  addName: { fontSize: 13, fontFamily: fonts.uiMed, color: colors.text },
  addMeta: { fontSize: 11, fontFamily: fonts.ui, color: colors.textMut, marginTop: 1 },
  addOwned: { fontSize: 10, fontFamily: fonts.ui, color: colors.textDim, marginTop: 2 },
  addControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnOff: { opacity: 0.3 },
  qtySign: { fontSize: 18, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 22 },
  qtyVal: { fontSize: 15, fontFamily: fonts.display, color: colors.text, minWidth: 18, textAlign: 'center' },
});
