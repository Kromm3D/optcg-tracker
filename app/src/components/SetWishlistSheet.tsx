// SetWishlistSheet — add every still-missing card of a set to a wishlist.
// The user chooses a printing (Normal / Parallel / Both), tunes the number of
// copies per rarity (Leaders default to 1), and picks a destination wishlist.

import React, { useEffect, useMemo, useState } from 'react';
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
import { summarizeSet, isEntryComplete, type SetEntry } from '../lib/setsStats';
import { getSettings } from '../lib/settings';
import {
  listWishlists,
  createWishlist,
  addCard,
  subscribe as subWishlists,
} from '../lib/wishlists';
import type { Variant, Wishlist } from '../types';

type Printing = 'normal' | 'parallel' | 'both';

const RARITY_ORDER = ['L', 'SEC', 'SR', 'SP', 'TR', 'R', 'UC', 'C', 'P'];

type Props = {
  visible: boolean;
  setCode: string;
  onClose: () => void;
};

/** Normal/base printing among this entry's in-set variants. */
function inSetNormal(entry: SetEntry): Variant | undefined {
  return entry.variants.find((v) => v.suffix === '') ?? entry.variants[0];
}

/** Parallel / alternate-art variants printed in this set (not the normal one). */
function inSetParallels(entry: SetEntry): Variant[] {
  const normalSuffix = inSetNormal(entry)?.suffix ?? '';
  return entry.variants.filter((v) => v.suffix !== normalSuffix);
}

function rarityOf(entry: SetEntry): string {
  return entry.variants[0]?.rarity?.toUpperCase() || '—';
}

export function SetWishlistSheet({ visible, setCode, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [printing, setPrinting] = useState<Printing>('normal');
  const [qtyByRarity, setQtyByRarity] = useState<Record<string, number>>({});
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Missing entries + the rarities present among them.
  const missing = useMemo(
    () => summarizeSet(setCode).entries.filter((e) => !isEntryComplete(e)),
    // Recompute whenever the sheet opens (owned state may have changed).
    [setCode, visible],
  );
  const rarities = useMemo(() => {
    const present = new Set(missing.map(rarityOf));
    return RARITY_ORDER.filter((r) => present.has(r)).concat(
      [...present].filter((r) => !RARITY_ORDER.includes(r)),
    );
  }, [missing]);

  useEffect(() => {
    if (!visible) return;
    setPrinting('normal');
    setPickedId(null);
    setCreating(false);
    setNewName('');
    const playset = getSettings().playsetSize;
    const init: Record<string, number> = {};
    for (const r of rarities) init[r] = r === 'L' || r === 'SEC' ? 1 : playset;
    setQtyByRarity(init);
    listWishlists().then(setWishlists);
    return subWishlists(() => listWishlists().then(setWishlists));
  }, [visible, rarities]);

  const bumpRarity = (r: string, delta: number) =>
    setQtyByRarity((prev) => ({ ...prev, [r]: Math.max(0, (prev[r] ?? 0) + delta) }));

  const handleCreateWL = async () => {
    if (!newName.trim()) return;
    const wl = await createWishlist(newName.trim());
    setCreating(false);
    setNewName('');
    setPickedId(wl.id);
  };

  const apply = async () => {
    if (!pickedId) return;
    for (const entry of missing) {
      const qty = qtyByRarity[rarityOf(entry)] ?? 0;
      if (qty <= 0) continue;
      const variants: Variant[] = [];
      const normal = inSetNormal(entry);
      if ((printing === 'normal' || printing === 'both') && normal) variants.push(normal);
      if (printing === 'parallel' || printing === 'both') variants.push(...inSetParallels(entry));
      for (const v of variants) {
        await addCard(pickedId, entry.card.code, v.suffix, qty);
      }
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('setwl.title')}</Text>
          <Text style={s.subtitle}>{t('setwl.missingCount', { n: missing.length })}</Text>

          {missing.length === 0 ? (
            <Text style={s.empty}>{t('setwl.none')}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 16 }}>
              {/* Printing choice */}
              <View>
                <Text style={s.sectionLabel}>{t('setwl.printing')}</Text>
                <View style={s.chipRow}>
                  {(['normal', 'parallel', 'both'] as Printing[]).map((p) => {
                    const on = printing === p;
                    return (
                      <Pressable key={p} style={[s.chip, on && s.chipOn]} onPress={() => setPrinting(p)}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>
                          {p === 'normal' ? t('setwl.normal') : p === 'parallel' ? t('setwl.parallel') : t('setwl.both')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Per-rarity steppers */}
              <View>
                <Text style={s.sectionLabel}>{t('setwl.perRarity')}</Text>
                <View style={{ gap: 8 }}>
                  {rarities.map((r) => (
                    <View key={r} style={s.rarityRow}>
                      <Text style={s.rarityLabel}>{r}</Text>
                      <View style={s.stepper}>
                        <Pressable style={s.stepBtn} onPress={() => bumpRarity(r, -1)}>
                          <Text style={s.stepSign}>−</Text>
                        </Pressable>
                        <Text style={s.stepVal}>{qtyByRarity[r] ?? 0}</Text>
                        <Pressable style={s.stepBtn} onPress={() => bumpRarity(r, +1)}>
                          <Text style={s.stepSign}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Wishlist picker */}
              <View>
                <Text style={s.sectionLabel}>{t('wl.pickTitle')}</Text>
                <View style={{ gap: 8 }}>
                  {wishlists.map((w) => (
                    <Pressable
                      key={w.id}
                      style={[s.item, pickedId === w.id && s.itemOn]}
                      onPress={() => setPickedId(w.id)}
                    >
                      <Icon name="heart" size={18} color={colors.accent} />
                      <Text style={s.itemName}>{w.name}</Text>
                    </Pressable>
                  ))}
                  {creating ? (
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
                  )}
                </View>
              </View>
            </ScrollView>
          )}

          {missing.length > 0 && (
            <Pressable
              style={[s.confirmBtn, !pickedId && { opacity: 0.4 }]}
              onPress={apply}
              disabled={!pickedId}
            >
              <Text style={s.confirmText}>{t('wl.confirm')}</Text>
            </Pressable>
          )}
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
    maxHeight: '88%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  empty: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center', paddingVertical: 24 },
  sectionLabel: {
    fontSize: 12, fontFamily: fonts.uiSemi, color: colors.textMut,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, alignItems: 'center',
    paddingVertical: 10, borderRadius: radii.lg,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  chipTextOn: { color: colors.accent },
  rarityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, paddingHorizontal: 14, paddingVertical: 8,
  },
  rarityLabel: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepSign: { fontSize: 18, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 22 },
  stepVal: { fontSize: 16, fontFamily: fonts.display, color: colors.text, minWidth: 22, textAlign: 'center' },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, padding: 14,
  },
  itemOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  itemName: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
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
