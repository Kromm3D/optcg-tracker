// DeckDetailScreen — view/edit a single deck.
// Cards are shown as DeckCardPile with stacked copies; missing copies are dimmed.

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
import { CachedImage } from '../components/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeckDetailScreenProps } from '../navigation';
import { colors, fonts, radii, spacing } from '../theme';
import { Icon } from '../components/Icon';
import { DeckCardPile } from '../components/DeckCardPile';
import { CARDS, CARD_LIST } from '../data/loadIndex';
import { fuzzyFilter } from '../lib/filters';
import { resolveImageUris } from '../lib/images';
import { getOwnedFor, subscribe as subOwned } from '../lib/ownedAggregate';
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

  // Search results for the Add panel — fuzzy search, same as BrowseScreen
  const searchResults = useMemo(() => {
    const base = search.trim() ? fuzzyFilter(CARD_LIST, search) : CARD_LIST;
    return base.slice(0, 60);
  }, [search]);

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

  if (!deck) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMut }}>Loading…</Text>
      </View>
    );
  }

  const total = deckTotal(deck);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Icon name="chevL" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => { setNewName(deck.name); setRenaming(true); }} style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{deck.name}</Text>
          <Text style={s.headerSub}>{deck.cards.length} slots · {total} cartas</Text>
        </Pressable>
        <Pressable style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Icon name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Card pile grid */}
      {deck.cards.length === 0 ? (
        <View style={s.empty}>
          <Icon name="grid" size={44} color={colors.textDim} />
          <Text style={s.emptyTitle}>Deck vacío</Text>
          <Text style={s.emptySub}>Pulsa + para añadir cartas al deck.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.grid}>
          {deckItems.map(({ dc, card }) => {
            const owned = getOwnedFor(card.code);
            const missing = owned < dc.qty;
            return (
              <View key={dc.code} style={[s.pileWrap, { width: cardW }]}>
                <DeckCardPile
                  card={card}
                  qty={dc.qty}
                  owned={owned}
                  width={cardW}
                />
                {/* Controls */}
                <View style={s.pileControls}>
                  <Pressable
                    style={s.qtyBtn}
                    onPress={() => handleQtyChange(dc.code, -1)}
                  >
                    <Text style={s.qtySign}>−</Text>
                  </Pressable>
                  <Text style={[s.qtyVal, missing && s.qtyMissing]}>
                    {dc.qty}
                  </Text>
                  <Pressable
                    style={s.qtyBtn}
                    onPress={() => handleQtyChange(dc.code, +1)}
                  >
                    <Text style={s.qtySign}>+</Text>
                  </Pressable>
                </View>
                <Text style={s.pileCode} numberOfLines={1}>{card.code}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add cards modal */}
      <Modal
        visible={showAdd}
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={[s.addHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={s.addTitle}>Add Cards</Text>
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
              placeholder="yellow luffy op01, red OP01-001…"
              placeholderTextColor={colors.textDim}
              autoFocus
            />
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(c) => c.code}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, paddingTop: 8 }}
            renderItem={({ item }) => {
              const inDeck = deck.cards.find((c) => c.code === item.code)?.qty ?? 0;
              const owned = getOwnedFor(item.code);
              const v = item.variants[0];
              const { uri: imgUri, fallback } = v ? resolveImageUris(v) : { uri: '' };
              return (
                <View style={s.addRow}>
                  {/* Card art thumbnail */}
                  <View style={s.addThumb}>
                    {imgUri ? (
                      <CachedImage
                        uri={imgUri}
                        fallbackUri={fallback}
                        style={s.addThumbImg}
                      />
                    ) : (
                      <View style={[s.addThumbImg, s.addThumbFallback]}>
                        <Text style={s.addThumbCode}>{item.code}</Text>
                      </View>
                    )}
                  </View>
                  {/* Info */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.addName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.addMeta} numberOfLines={1}>
                      {item.code}{item.colors?.length ? ` · ${item.colors.join('/')}` : ''}{item.type ? ` · ${item.type}` : ''}
                    </Text>
                    <Text style={s.addOwned}>owned: {owned}</Text>
                  </View>
                  {/* +/- controls */}
                  <View style={s.addControls}>
                    <Pressable
                      style={[s.qtyBtn, inDeck === 0 && s.qtyBtnOff]}
                      onPress={() => handleQtyChange(item.code, -1)}
                      disabled={inDeck === 0}
                    >
                      <Text style={s.qtySign}>−</Text>
                    </Pressable>
                    <Text style={[s.qtyVal, inDeck > owned && s.qtyMissing]}>
                      {inDeck}
                    </Text>
                    <Pressable
                      style={s.qtyBtn}
                      onPress={() => handleQtyChange(item.code, +1)}
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
            <Text style={s.modalTitle}>Rename Deck</Text>
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
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalConfirm} onPress={handleRename}>
                <Text style={s.modalConfirmText}>Rename</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: CARD_GAP,
    paddingBottom: 110,
  },

  pileWrap: { alignItems: 'center', gap: 6 },

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
  emptyTitle: { fontSize: 20, fontFamily: fonts.uiBold, color: colors.text },
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
