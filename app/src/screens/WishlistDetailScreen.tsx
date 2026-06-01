// WishlistDetailScreen — view/edit a single wishlist.
// Cards are shown as DeckCardPile where qty = needed, owned = getOwnedFor.
// Mirrors the look of DeckDetailScreen: grid of piles, +/- for "needed" qty.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WishlistDetailScreenProps } from '../navigation';
import { colors, fonts, radii, spacing } from '../theme';
import { Icon } from '../components/Icon';
import { DeckCardPile } from '../components/DeckCardPile';
import { CachedImage } from '../components/CachedImage';
import { VariantPickerSheet } from '../components/VariantPickerSheet';
import { CARDS, CARD_LIST } from '../data/loadIndex';
import { fuzzyFilter } from '../lib/filters';
import { resolveImageUris } from '../lib/images';
import { getOwnedFor, subscribe as subOwned } from '../lib/ownedAggregate';
import { getDefaultWishlistSuffix } from '../lib/settings';
import {
  getWishlist,
  renameWishlist,
  addCard,
  adjustNeeded,
  subscribe as subWishlists,
} from '../lib/wishlists';
import { useT } from '../lib/i18n';
import type { Card, Wishlist, WishlistCard } from '../types';

const COLUMNS = 3;
const CARD_GAP = 10;

type ResolvedEntry = {
  wc: WishlistCard;
  card: Card;
};

export function WishlistDetailScreen({ route, navigation }: WishlistDetailScreenProps) {
  const t = useT();
  const { wishlistId } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = Math.floor((width - spacing.lg * 2 - CARD_GAP * (COLUMNS - 1)) / COLUMNS);

  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [, forceOwned] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  // Variant picker (tap a card pile to change its variant)
  const [pickerCard, setPickerCard] = useState<Card | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const refresh = useCallback(() => {
    getWishlist(wishlistId).then(setWishlist);
  }, [wishlistId]);

  useEffect(() => {
    refresh();
    const u1 = subWishlists(refresh);
    const u2 = subOwned(() => forceOwned((n) => n + 1));
    return () => { u1(); u2(); };
  }, [refresh]);

  // Resolved entries sorted by code
  const entries = useMemo<ResolvedEntry[]>(() => {
    if (!wishlist) return [];
    return (Object.values(wishlist.cards) as WishlistCard[])
      .map((wc) => ({ wc, card: CARDS[wc.code] }))
      .filter((x): x is ResolvedEntry => !!x.card)
      .sort((a, b) => a.card.code.localeCompare(b.card.code, undefined, { numeric: true }));
  }, [wishlist]);

  // Search results for the add-card panel
  const searchResults = useMemo(() => {
    const base = search.trim() ? fuzzyFilter(CARD_LIST, search) : CARD_LIST;
    return base.slice(0, 60);
  }, [search]);

  const handleNeededChange = useCallback((wc: WishlistCard, delta: number) => {
    adjustNeeded(wishlistId, wc.code, wc.suffix, delta);
  }, [wishlistId]);

  const handleAddCard = useCallback((code: string) => {
    const card = CARDS[code];
    if (!card) return;
    const suffix = getDefaultWishlistSuffix(card.variants);
    const existing = wishlist?.cards[`${code}${suffix}`];
    const current = existing?.needed ?? 0;
    addCard(wishlistId, code, suffix, current + 1);
  }, [wishlistId, wishlist]);

  const handleRename = useCallback(async () => {
    if (!newName.trim()) return;
    await renameWishlist(wishlistId, newName);
    setRenaming(false);
  }, [wishlistId, newName]);

  if (!wishlist) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMut }}>Loading…</Text>
      </View>
    );
  }

  const totalNeeded = entries.reduce((acc, e) => acc + e.wc.needed, 0);
  const totalOwned = entries.reduce((acc, e) => acc + Math.min(getOwnedFor(e.wc.code), e.wc.needed), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="chevL" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => { setNewName(wishlist.name); setRenaming(true); }}
          style={{ flex: 1 }}
        >
          <Text style={s.headerTitle} numberOfLines={1}>{wishlist.name}</Text>
          <Text style={s.headerSub}>
            {entries.length} {t('wl.entries')} · {totalOwned}/{totalNeeded} {t('wl.copiesNeeded')}
          </Text>
        </Pressable>
        <Pressable style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Icon name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Card pile grid */}
      {entries.length === 0 ? (
        <View style={s.empty}>
          <Icon name="heart" size={44} color={colors.textDim} />
          <Text style={s.emptyTitle}>{t('wl.emptyTitle')}</Text>
          <Text style={s.emptySub}>{t('wl.emptyBody')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.grid}>
          {entries.map(({ wc, card }) => {
            const owned = getOwnedFor(card.code);
            const variant = card.variants.find((v) => v.suffix === wc.suffix) ?? card.variants[0];
            // DeckCardPile with qty=needed, owned=owned shows the same layered pile UX
            return (
              <View key={`${wc.code}${wc.suffix}`} style={[s.pileWrap, { width: cardW }]}>
                <Pressable onPress={() => { setPickerCard(card); setShowPicker(true); }}>
                  <DeckCardPile card={card} qty={wc.needed} owned={owned} width={cardW} />
                </Pressable>

                {/* owned / needed fraction */}
                <Text style={[s.fraction, owned >= wc.needed && s.fractionDone]}>
                  {t('wl.owned')}: {owned} / {wc.needed}
                </Text>

                {/* +/- controls for "needed" */}
                <View style={s.pileControls}>
                  <Pressable
                    style={s.qtyBtn}
                    onPress={() => handleNeededChange(wc, -1)}
                  >
                    <Text style={s.qtySign}>−</Text>
                  </Pressable>
                  <Text style={s.qtyVal}>{wc.needed}</Text>
                  <Pressable
                    style={s.qtyBtn}
                    onPress={() => handleNeededChange(wc, +1)}
                  >
                    <Text style={s.qtySign}>+</Text>
                  </Pressable>
                </View>

                {/* variant label + card code */}
                <Text style={s.variantLabel} numberOfLines={1}>
                  {variant?.label || 'Normal'}
                </Text>
                <Text style={s.pileCode} numberOfLines={1}>{card.code}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add cards modal */}
      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={[s.addHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={s.addTitle}>{t('wl.addCards')}</Text>
            <Pressable onPress={() => setShowAdd(false)}>
              <Icon name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={s.searchWrap}>
            <Icon name="search" size={18} color={colors.textDim} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="yellow luffy op15, OP01-001…"
              placeholderTextColor={colors.textDim}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(c) => c.code}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, paddingTop: 8 }}
            renderItem={({ item }) => {
              // Find the entry for this card (any suffix)
              const existingEntries = (Object.values(wishlist.cards) as WishlistCard[]).filter((wc) => wc.code === item.code);
              const totalNeededForCard: number = existingEntries.reduce((a, wc) => a + wc.needed, 0);
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
                      {item.code}{item.colors?.length ? ` · ${item.colors.join('/')}` : ''}
                    </Text>
                    <Text style={s.addOwned}>
                      {t('wl.owned')}: {owned}
                      {totalNeededForCard > 0 ? `  ·  ${t('wl.copiesNeeded')}: ${totalNeededForCard}` : ''}
                    </Text>
                  </View>
                  <View style={s.addControls}>
                    <Pressable
                      style={[s.qtyBtn, totalNeededForCard === 0 && s.qtyBtnOff]}
                      onPress={() => {
                        // Remove 1 from the default-variant entry
                        const suffix = getDefaultWishlistSuffix(item.variants);
                        adjustNeeded(wishlistId, item.code, suffix, -1);
                      }}
                      disabled={totalNeededForCard === 0}
                    >
                      <Text style={s.qtySign}>−</Text>
                    </Pressable>
                    <Text style={s.qtyVal}>{totalNeededForCard}</Text>
                    <Pressable
                      style={s.qtyBtn}
                      onPress={() => handleAddCard(item.code)}
                    >
                      <Text style={s.qtySign}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
          />
        </View>
      </Modal>

      {/* Rename modal */}
      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <Pressable style={s.modalBg} onPress={() => setRenaming(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>{t('wl.rename')}</Text>
            <TextInput
              style={s.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor={colors.textDim}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRename}
            />
            <View style={s.modalRow}>
              <Pressable style={s.modalCancel} onPress={() => setRenaming(false)}>
                <Text style={s.modalCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable style={s.modalConfirm} onPress={handleRename}>
                <Text style={s.modalConfirmText}>{t('wl.renameAction')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Variant picker (tap a pile to reassign variant) */}
      <VariantPickerSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        card={pickerCard}
        wishlistId={wishlistId}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: CARD_GAP,
    paddingBottom: 110,
  },

  pileWrap: { alignItems: 'center', gap: 4 },
  fraction: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textMut },
  fractionDone: { color: colors.up },
  pileControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnOff: { opacity: 0.3 },
  qtySign: { fontSize: 18, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 22 },
  qtyVal: { fontSize: 15, fontFamily: fonts.display, color: colors.text, minWidth: 18, textAlign: 'center' },
  variantLabel: { fontSize: 9, fontFamily: fonts.uiSemi, color: colors.accent, marginTop: 1 },
  pileCode: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textDim },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 20, fontFamily: fonts.uiBold, color: colors.text },
  emptySub: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center' },

  // Add cards modal
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
  addThumb: { width: 48, height: 67, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surface2, flexShrink: 0 },
  addThumbImg: { width: '100%', height: '100%' },
  addThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  addThumbCode: { fontSize: 8, color: colors.textDim, textAlign: 'center' },
  addName: { fontSize: 13, fontFamily: fonts.uiMed, color: colors.text },
  addMeta: { fontSize: 11, fontFamily: fonts.ui, color: colors.textMut, marginTop: 1 },
  addOwned: { fontSize: 10, fontFamily: fonts.ui, color: colors.textDim, marginTop: 2 },
  addControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },

  // Rename modal
  modalBg: { flex: 1, backgroundColor: 'rgba(14,12,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 16 },
  modalTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  modalInput: { height: 50, borderRadius: radii.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, fontSize: 16, fontFamily: fonts.ui, color: colors.text },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, height: 48, borderRadius: radii.lg, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.textMut },
  modalConfirm: { flex: 1, height: 48, borderRadius: radii.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
});
