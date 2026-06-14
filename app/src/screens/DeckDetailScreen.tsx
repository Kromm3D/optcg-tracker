// DeckDetailScreen — view/edit a single deck.
// Cards are shown as DeckCardPile with stacked copies; missing copies are dimmed.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeckDetailScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle } from '../theme';
import { Icon } from '../components/Icon';
import { DeckCardPile } from '../components/DeckCardPile';
import { AddCardsModal } from '../components/AddCardsModal';
import { AppModal } from '../components/AppModal';
import { Button } from '../components/Button';
import { Counter } from '../components/Counter';
import { useToast } from '../components/Toast';
import { CARDS } from '../data/loadIndex';
import { getOwnedFor, subscribe as subOwned } from '../lib/ownedAggregate';
import { addCard } from '../lib/wishlists';
import { getDefaultWishlistSuffix } from '../lib/settings';
import { WishlistPickerModal } from '../components/WishlistPickerModal';
import type { Wishlist } from '../types';
import { useT } from '../lib/i18n';
import {
  getDeck,
  setDeckCard,
  renameDeck,
  deckTotal,
  subscribe as subDecks,
  type Deck,
} from '../lib/decks';
import type { Card } from '../types';

const COLUMNS = 3;
const CARD_GAP = 10;

export function DeckDetailScreen({ route, navigation }: DeckDetailScreenProps) {
  const t = useT();
  const toast = useToast();
  const { deckId } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = Math.floor((width - spacing.lg * 2 - CARD_GAP * (COLUMNS - 1)) / COLUMNS);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [, forceOwned] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  // Wishlist picker for "Add missing"
  const [showWLPicker, setShowWLPicker] = useState(false);
  const [pendingMissingCards, setPendingMissingCards] = useState<Array<{ code: string; needed: number }>>([]);

  const refresh = useCallback(() => {
    getDeck(deckId).then(setDeck);
  }, [deckId]);

  useEffect(() => {
    refresh();
    const u1 = subDecks(refresh);
    const u2 = subOwned(() => forceOwned((n) => n + 1));
    return () => { u1(); u2(); };
  }, [refresh]);

  // Grid items from deck cards
  const deckItems = useMemo(() => {
    if (!deck) return [];
    return deck.cards
      .map((dc) => ({ dc, card: CARDS[dc.code] }))
      .filter((x): x is { dc: typeof x.dc; card: Card } => !!x.card)
      .sort((a, b) => a.card.code.localeCompare(b.card.code, undefined, { numeric: true }));
  }, [deck]);

  const handleQtyChange = useCallback(
    (code: string, delta: number) => {
      if (!deck) return;
      const current = deck.cards.find((c) => c.code === code)?.qty ?? 0;
      const next = Math.max(0, Math.min(4, current + delta));
      setDeckCard(deckId, code, next);
    },
    [deck, deckId]
  );

  const handleRename = useCallback(async () => {
    if (!newName.trim()) return;
    await renameDeck(deckId, newName);
    setRenaming(false);
  }, [deckId, newName]);

  const showToast = useCallback((msg: string) => {
    toast({ message: msg });
  }, [toast]);

  // Step 1: collect missing cards, then open wishlist picker
  const handleAddMissing = useCallback(() => {
    if (!deck) return;
    const missing: Array<{ code: string; needed: number }> = [];
    for (const dc of deck.cards) {
      const owned = getOwnedFor(dc.code);
      const need = dc.qty - owned;
      if (need > 0) missing.push({ code: dc.code, needed: need });
    }
    if (missing.length === 0) {
      showToast(t('deck.missingNone'));
      return;
    }
    setPendingMissingCards(missing);
    setShowWLPicker(true);
  }, [deck, t, showToast]);

  // Step 2: user picked a wishlist — add all missing cards to it
  const handleWishlistPicked = useCallback(async (wl: Wishlist) => {
    setShowWLPicker(false);
    for (const { code, needed } of pendingMissingCards) {
      // Use user's preferred default variant (Settings → wishlistDefaultVariant)
      const suffix = getDefaultWishlistSuffix(CARDS[code]?.variants ?? []);
      await addCard(wl.id, code, suffix, needed);
    }
    showToast(t('deck.missingAdded', { n: pendingMissingCards.length }));
    setPendingMissingCards([]);
  }, [pendingMissingCards, t, showToast]);

  if (!deck) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const total = deckTotal(deck);
  const overLimit = total > 50;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          style={({ pressed }) => [s.backBtn, pressed && pressedStyle]}
        >
          <Icon name="chevL" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => { setNewName(deck.name); setRenaming(true); }}
          style={({ pressed }) => [{ flex: 1 }, pressed && pressedStyle]}
          accessibilityRole="button"
          accessibilityLabel={t('deck.rename')}
        >
          <Text style={s.headerTitle} numberOfLines={1}>{deck.name}</Text>
          <Text style={s.headerSub}>
            {deck.cards.length} {t('decks.slots')} ·{' '}
            <Text style={overLimit ? { color: colors.down, fontFamily: fonts.uiBold } : undefined}>
              {total} {t('decks.cards')}
            </Text>
            {overLimit ? <Text style={s.overLimitTag}>  ⚠ {t('deck.overLimit')}</Text> : null}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.wishBtn, pressed && pressedStyle]}
          onPress={handleAddMissing}
          accessibilityRole="button"
          accessibilityLabel={t('deck.addMissing')}
        >
          <Icon name="heart" size={20} color={colors.accent} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.addBtn, pressed && pressedStyle]}
          onPress={() => setShowAdd(true)}
          accessibilityRole="button"
          accessibilityLabel={t('wl.addCards')}
        >
          <Icon name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Card pile grid */}
      {deck.cards.length === 0 ? (
        <View style={s.empty}>
          <Icon name="grid" size={44} color={colors.textDim} />
          <Text style={s.emptyTitle}>{t('deck.empty')}</Text>
          <Text style={s.emptySub}>{t('deck.emptyBody')}</Text>
        </View>
      ) : (
        <FlatList
          data={deckItems}
          keyExtractor={(item) => item.dc.code}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: CARD_GAP }}
          contentContainerStyle={s.grid}
          initialNumToRender={18}
          maxToRenderPerBatch={18}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item: { dc, card } }) => {
            const owned = getOwnedFor(card.code);
            const missing = owned < dc.qty;
            return (
              <View style={[s.pileWrap, { width: cardW }]}>
                <DeckCardPile card={card} qty={dc.qty} owned={owned} width={cardW} />
                <View style={s.pileControls}>
                  <Counter
                    value={dc.qty}
                    onAdjust={(d) => handleQtyChange(dc.code, d)}
                    min={0}
                    max={4}
                    size="sm"
                    label={card.code}
                  />
                </View>
                <Text style={[s.pileCode, missing && s.qtyMissing]} numberOfLines={1}>{card.code}</Text>
              </View>
            );
          }}
        />
      )}

      {/* Add cards modal (shared) — deck qty capped at 4 by handleQtyChange */}
      <AddCardsModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        search={search}
        onSearchChange={setSearch}
        getQty={(code) => deck.cards.find((c) => c.code === code)?.qty ?? 0}
        onChange={handleQtyChange}
      />

      {/* Wishlist picker for "Add missing" */}
      <WishlistPickerModal
        visible={showWLPicker}
        onClose={() => setShowWLPicker(false)}
        onSelect={handleWishlistPicked}
      />

      {/* Rename modal */}
      <AppModal visible={renaming} onClose={() => setRenaming(false)} title={t('deck.rename')}>
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
          <Button title={t('common.cancel')} variant="secondary" onPress={() => setRenaming(false)} style={s.modalBtn} />
          <Button title={t('deck.renameAction')} onPress={handleRename} disabled={!newName.trim()} style={s.modalBtn} />
        </View>
      </AppModal>
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
  headerTitle: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: 2,
  },
  overLimitTag: {
    fontFamily: fonts.uiBold,
    color: colors.down,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { fontSize: 13, fontFamily: fonts.uiMed, color: colors.text },

  grid: {
    padding: spacing.lg,
    gap: CARD_GAP,
    paddingBottom: 110,
  },

  pileWrap: { alignItems: 'center', gap: 6, marginBottom: CARD_GAP },

  pileControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
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
  qtySign: { fontSize: 18, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 22 },
  qtyVal: {
    fontSize: 15,
    fontFamily: fonts.display,
    color: colors.text,
    minWidth: 18,
    textAlign: 'center',
  },
  qtyMissing: { color: colors.accent },
  pileCode: {
    fontSize: 10,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  emptySub: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center' },

  // Add modal
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
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.ui,
    color: colors.text,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
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
  qtyBtnOff: { opacity: 0.3 },

  // Rename modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(14,12,26,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  modalInput: {
    height: 50,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fonts.ui,
    color: colors.text,
  },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.textMut },
  modalConfirm: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
});
