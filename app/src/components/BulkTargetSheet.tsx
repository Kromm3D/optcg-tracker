// BulkTargetSheet — finishes a bulk action. Shows a quantity stepper and, for
// the Wishlist/Deck targets, a list to pick (or create) the destination. On
// confirm it applies the chosen quantity to every selected card+variant.

import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import type { BulkTarget } from './BulkActionBar';
import { adjust } from '../lib/collection';
import { getTradeQty, setTradeOverride } from '../lib/trade';
import { listDecks, getDeck, setDeckCard } from '../lib/decks';
import { listWishlists, createWishlist, addCard, subscribe as subWishlists } from '../lib/wishlists';
import type { Deck } from '../lib/decks';
import type { Wishlist } from '../types';

export type BulkSelection = { code: string; suffix: string };

type Props = {
  visible: boolean;
  target: BulkTarget | null;
  selections: BulkSelection[];
  onClose: () => void;
  onDone: (count: number, target: BulkTarget) => void;
};

export function BulkTargetSheet({ visible, target, selections, onClose, onDone }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(1);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const needsPick = target === 'deck' || target === 'wishlist';

  useEffect(() => {
    if (!visible) return;
    setQty(1);
    setPickedId(null);
    setCreating(false);
    setNewName('');
    if (target === 'deck') listDecks().then(setDecks);
    if (target === 'wishlist') {
      listWishlists().then(setWishlists);
      return subWishlists(() => listWishlists().then(setWishlists));
    }
  }, [visible, target]);

  if (!target) return null;

  const targetLabel = t(
    target === 'collection' ? 'bulk.toCollection'
      : target === 'wishlist' ? 'bulk.toWishlist'
      : target === 'trade' ? 'bulk.toTrade'
      : 'bulk.toDeck',
  );

  const handleCreateWL = async () => {
    if (!newName.trim()) return;
    const wl = await createWishlist(newName.trim());
    setCreating(false);
    setNewName('');
    setPickedId(wl.id);
  };

  const apply = async () => {
    if (selections.length === 0) return;
    if (target === 'collection') {
      for (const sel of selections) await adjust(sel.code, sel.suffix, qty);
    } else if (target === 'trade') {
      // Trade is base-code only — dedupe by code so we add once per card.
      const codes = [...new Set(selections.map((s) => s.code))];
      for (const code of codes) await setTradeOverride(code, getTradeQty(code) + qty);
    } else if (target === 'wishlist') {
      if (!pickedId) return;
      for (const sel of selections) await addCard(pickedId, sel.code, sel.suffix, qty);
    } else if (target === 'deck') {
      if (!pickedId) return;
      const deck = await getDeck(pickedId);
      const existing = new Map((deck?.cards ?? []).map((c) => [c.code, c.qty]));
      // Deck is base-code only and capped at 4 copies.
      const codes = [...new Set(selections.map((s) => s.code))];
      for (const code of codes) {
        const next = Math.min(4, (existing.get(code) ?? 0) + qty);
        await setDeckCard(pickedId, code, next);
      }
    }
    onDone(selections.length, target);
  };

  const canConfirm = !needsPick || !!pickedId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('bulk.addTitle', { n: selections.length })}</Text>
          <Text style={s.subtitle}>{targetLabel}</Text>

          {/* Quantity stepper */}
          <View style={s.qtyRow}>
            <Text style={s.qtyLabel}>{t('bulk.quantity')}</Text>
            <View style={s.stepper}>
              <Pressable style={s.stepBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                <Text style={s.stepSign}>−</Text>
              </Pressable>
              <Text style={s.stepVal}>{qty}</Text>
              <Pressable style={s.stepBtn} onPress={() => setQty((q) => q + 1)}>
                <Text style={s.stepSign}>+</Text>
              </Pressable>
            </View>
          </View>

          {/* Deck / Wishlist picker */}
          {needsPick && (
            <ScrollView style={s.list} contentContainerStyle={{ gap: 8 }}>
              {target === 'deck' && decks.length === 0 && (
                <Text style={s.empty}>{t('bulk.noDecks')}</Text>
              )}
              {target === 'deck' &&
                decks.map((d) => (
                  <Pressable
                    key={d.id}
                    style={[s.item, pickedId === d.id && s.itemOn]}
                    onPress={() => setPickedId(d.id)}
                  >
                    <Icon name="layers" size={18} color={colors.accent} />
                    <Text style={s.itemName}>{d.name}</Text>
                  </Pressable>
                ))}
              {target === 'wishlist' &&
                wishlists.map((w) => (
                  <Pressable
                    key={w.id}
                    style={[s.item, pickedId === w.id && s.itemOn]}
                    onPress={() => setPickedId(w.id)}
                  >
                    <Icon name="heart" size={18} color={colors.accent} />
                    <Text style={s.itemName}>{w.name}</Text>
                  </Pressable>
                ))}

              {target === 'wishlist' && (creating ? (
                <View style={s.createBox}>
                  <TextInput
                    style={s.nameInput}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder={t('wl.namePlaceholder')}
                    placeholderTextColor={colors.textDim}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCreateWL}
                  />
                  <Pressable
                    style={[s.smallBtn, !newName.trim() && { opacity: 0.4 }]}
                    onPress={handleCreateWL}
                    disabled={!newName.trim()}
                  >
                    <Text style={s.smallBtnText}>{t('wl.create')}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={s.newRow} onPress={() => setCreating(true)}>
                  <Icon name="plus" size={16} color={colors.accent} />
                  <Text style={s.newRowText}>{t('wl.newWishlist')}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <Pressable
            style={[s.confirmBtn, !canConfirm && { opacity: 0.4 }]}
            onPress={apply}
            disabled={!canConfirm}
          >
            <Text style={s.confirmText}>{t('bulk.confirmAdd', { target: targetLabel })}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,12,26,0.75)', justifyContent: 'flex-end' },
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
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepSign: { fontSize: 20, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 24 },
  stepVal: { fontSize: 18, fontFamily: fonts.display, color: colors.text, minWidth: 26, textAlign: 'center' },
  list: { maxHeight: 260 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, padding: 14,
  },
  itemOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  itemName: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  empty: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center', paddingVertical: 16 },
  newRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  newRowText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.accent },
  createBox: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nameInput: {
    flex: 1, height: 44, borderRadius: radii.lg,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.ui, color: colors.text,
  },
  smallBtn: {
    height: 44, paddingHorizontal: 16, borderRadius: radii.lg,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  smallBtnText: { fontSize: 14, fontFamily: fonts.uiBold, color: '#fff' },
  confirmBtn: { backgroundColor: colors.accent, borderRadius: radii.xl, paddingVertical: 14, alignItems: 'center' },
  confirmText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
});
