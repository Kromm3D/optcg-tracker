// DecksScreen — list of user decks + create new.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DecksScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { AppModal } from '../components/AppModal';
import { Button } from '../components/Button';
import { CachedImage } from '../components/CachedImage';
import { CARDS } from '../data/loadIndex';
import { resolveImageUris } from '../lib/images';
import {
  listDecks,
  createDeck,
  deleteDeck,
  setDeckCard,
  deckTotal,
  subscribe,
  type Deck,
} from '../lib/decks';
import { parseOptcgSim, defaultDeckName } from '../lib/optcgsim';
import { useT } from '../lib/i18n';

/** Small card-art thumbnail for the deck row. Shows leader art or fallback icon. */
function DeckThumb({ deck }: { deck: Deck }) {
  const img = leaderImageUri(deck);
  if (img) {
    return (
      <View style={s.deckThumb}>
        <CachedImage uri={img.uri} fallbackUri={img.fallback} style={s.deckThumbImg} />
      </View>
    );
  }
  return (
    <View style={s.deckIcon}>
      <Icon name="binder" size={22} color={colors.accent} />
    </View>
  );
}

/** Returns the image URI for the first Leader card in the deck, or null. */
function leaderImageUri(deck: Deck): { uri: string; fallback: string } | null {
  // Prefer explicit leaderId, then first card with type Leader
  const leaderCode =
    deck.leaderId ??
    deck.cards.find((dc) => CARDS[dc.code]?.type === 'Leader')?.code;
  if (!leaderCode) return null;
  const card = CARDS[leaderCode];
  if (!card) return null;
  const v = card.variants[0];
  if (!v) return null;
  const { uri, fallback } = resolveImageUris(v);
  return { uri, fallback: fallback ?? '' };
}

export function DecksScreen({ navigation }: DecksScreenProps) {
  const t = useT();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

  const refresh = useCallback(() => {
    listDecks().then(setDecks);
  }, []);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const deck = await createDeck(newName);
    setShowModal(false);
    setNewName('');
    navigation.navigate('DeckDetail', { deckId: deck.id });
  }, [newName, navigation]);

  const confirmDelete = useCallback(() => {
    if (deckToDelete) deleteDeck(deckToDelete.id);
    setDeckToDelete(null);
  }, [deckToDelete]);

  const handleImport = useCallback(async () => {
    const entries = parseOptcgSim(importText);
    if (entries.length === 0) {
      Alert.alert(t('decks.importTitle'), t('decks.importedNone'));
      return;
    }
    const deck = await createDeck(newName.trim() || defaultDeckName(entries));
    for (const e of entries) await setDeckCard(deck.id, e.code, e.qty);
    setShowImport(false);
    setImportText('');
    setNewName('');
    navigation.navigate('DeckDetail', { deckId: deck.id });
  }, [importText, newName, navigation, t]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {decks.length === 0 ? (
        <View style={s.empty}>
          <Icon name="binder" size={48} color={colors.textDim} />
          <Text style={s.emptyTitle}>{t('decks.emptyTitle')}</Text>
          <Text style={s.emptySub}>{t('decks.emptyBody')}</Text>
          <Pressable
            style={({ pressed }) => [s.createBtn, pressed && pressedStyle]}
            onPress={() => setShowModal(true)}
            accessibilityRole="button"
            accessibilityLabel={t('decks.newDeck')}
          >
            <Icon name="plus" size={18} color="#fff" />
            <Text style={s.createBtnText}>{t('decks.newDeck')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.importBtn, pressed && pressedStyle]}
            onPress={() => setShowImport(true)}
            accessibilityRole="button"
            accessibilityLabel={t('decks.importSim')}
          >
            <Icon name="external" size={18} color={colors.accent} />
            <Text style={s.importBtnText}>{t('decks.importSim')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(d) => d.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              <Pressable
                style={({ pressed }) => [s.newRow, pressed && pressedStyle]}
                onPress={() => setShowModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('decks.newDeck')}
              >
                <Icon name="plus" size={18} color={colors.accent} />
                <Text style={s.newRowText}>{t('decks.newDeck')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.newRow, pressed && pressedStyle]}
                onPress={() => setShowImport(true)}
                accessibilityRole="button"
                accessibilityLabel={t('decks.importSim')}
              >
                <Icon name="external" size={18} color={colors.accent} />
                <Text style={s.newRowText}>{t('decks.importSim')}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [s.deckRow, pressed && pressedSurface]}
              onPress={() => navigation.navigate('DeckDetail', { deckId: item.id })}
              onLongPress={() => setDeckToDelete(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <DeckThumb deck={item} />
              <View style={{ flex: 1 }}>
                <Text style={s.deckName}>{item.name}</Text>
                <Text style={s.deckMeta}>
                  {item.cards.length} {t('decks.slots')} · {deckTotal(item)} {t('decks.cards')}
                </Text>
              </View>
              <Pressable
                onPress={() => setDeckToDelete(item)}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('decks.deleteTitle')}
                style={({ pressed }) => [s.rowMenuBtn, pressed && pressedStyle]}
              >
                <Icon name="dots" size={20} color={colors.textMut} />
              </Pressable>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
        />
      )}

      {/* Create deck modal */}
      <AppModal visible={showModal} onClose={() => setShowModal(false)} title={t('decks.newDeck')}>
        <TextInput
          style={s.modalInput}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('decks.deckName')}
          placeholderTextColor={colors.textDim}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <View style={s.modalRow}>
          <Button title={t('decks.cancel')} variant="secondary" onPress={() => setShowModal(false)} style={s.modalBtn} />
          <Button title={t('decks.create')} onPress={handleCreate} disabled={!newName.trim()} style={s.modalBtn} />
        </View>
      </AppModal>

      {/* Import from OPTCGSim modal */}
      <AppModal visible={showImport} onClose={() => setShowImport(false)} title={t('decks.importTitle')}>
        <TextInput
          style={[s.modalInput, s.importInput]}
          value={importText}
          onChangeText={setImportText}
          placeholder={t('decks.importPlaceholder')}
          placeholderTextColor={colors.textDim}
          autoFocus
          multiline
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <View style={s.modalRow}>
          <Button title={t('decks.cancel')} variant="secondary" onPress={() => setShowImport(false)} style={s.modalBtn} />
          <Button title={t('decks.import')} onPress={handleImport} disabled={!importText.trim()} style={s.modalBtn} />
        </View>
      </AppModal>

      {/* Delete confirmation (themed — replaces native Alert) */}
      <AppModal visible={deckToDelete !== null} onClose={() => setDeckToDelete(null)} title={t('decks.deleteTitle')}>
        <Text style={s.confirmBody}>{t('decks.deleteConfirm', { name: deckToDelete?.name ?? '' })}</Text>
        <View style={s.modalRow}>
          <Button title={t('decks.cancel')} variant="secondary" onPress={() => setDeckToDelete(null)} style={s.modalBtn} />
          <Button title={t('common.delete')} variant="danger" onPress={confirmDelete} style={s.modalBtn} />
        </View>
      </AppModal>
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 110, gap: spacing.sm },

  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: spacing.sm,
  },
  newRowText: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.accent },

  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deckThumb: {
    width: 44,
    height: 62,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  deckThumbImg: { width: '100%', height: '100%' },
  deckIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckName: { fontSize: 16, fontFamily: fonts.uiBold, color: colors.text },
  deckMeta: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  rowMenuBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  sep: { height: spacing.sm },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  emptySub: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: colors.textMut,
    textAlign: 'center',
    lineHeight: 22,
  },
  createBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.accent,
  },
  createBtnText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  importBtnText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.accent },
  importInput: { height: 90, textAlignVertical: 'top', paddingTop: 12 },

  // Modal
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
  confirmBody: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, lineHeight: 21 },
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
