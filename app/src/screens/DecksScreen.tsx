// DecksScreen — list of user decks + create new.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DecksScreenProps } from '../navigation';
import { colors, fonts, radii, spacing } from '../theme';
import { Icon } from '../components/Icon';
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

  const handleDelete = useCallback((deck: Deck) => {
    Alert.alert('Delete deck', `Delete "${deck.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDeck(deck.id) },
    ]);
  }, []);

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
          <Pressable style={s.createBtn} onPress={() => setShowModal(true)}>
            <Icon name="plus" size={18} color="#fff" />
            <Text style={s.createBtnText}>{t('decks.newDeck')}</Text>
          </Pressable>
          <Pressable style={s.importBtn} onPress={() => setShowImport(true)}>
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
              <Pressable style={s.newRow} onPress={() => setShowModal(true)}>
                <Icon name="plus" size={18} color={colors.accent} />
                <Text style={s.newRowText}>{t('decks.newDeck')}</Text>
              </Pressable>
              <Pressable style={s.newRow} onPress={() => setShowImport(true)}>
                <Icon name="external" size={18} color={colors.accent} />
                <Text style={s.newRowText}>{t('decks.importSim')}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={s.deckRow}
              onPress={() => navigation.navigate('DeckDetail', { deckId: item.id })}
              onLongPress={() => handleDelete(item)}
            >
              <DeckThumb deck={item} />
              <View style={{ flex: 1 }}>
                <Text style={s.deckName}>{item.name}</Text>
                <Text style={s.deckMeta}>
                  {item.cards.length} {t('decks.slots')} · {deckTotal(item)} {t('decks.cards')}
                </Text>
              </View>
              <Icon name="chevR" size={18} color={colors.textDim} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
        />
      )}

      {/* Create deck modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable style={s.modalBg} onPress={() => setShowModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>{t('decks.newDeck')}</Text>
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
              <Pressable style={s.modalCancel} onPress={() => setShowModal(false)}>
                <Text style={s.modalCancelText}>{t('decks.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[s.modalConfirm, !newName.trim() && { opacity: 0.4 }]}
                onPress={handleCreate}
                disabled={!newName.trim()}
              >
                <Text style={s.modalConfirmText}>{t('decks.create')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Import from OPTCGSim modal */}
      <Modal
        visible={showImport}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImport(false)}
      >
        <Pressable style={s.modalBg} onPress={() => setShowImport(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>{t('decks.importTitle')}</Text>
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
              <Pressable style={s.modalCancel} onPress={() => setShowImport(false)}>
                <Text style={s.modalCancelText}>{t('decks.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[s.modalConfirm, !importText.trim() && { opacity: 0.4 }]}
                onPress={handleImport}
                disabled={!importText.trim()}
              >
                <Text style={s.modalConfirmText}>{t('decks.import')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

  sep: { height: spacing.sm },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontFamily: fonts.uiBold, color: colors.text },
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
