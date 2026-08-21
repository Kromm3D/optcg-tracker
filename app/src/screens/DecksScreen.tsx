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
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { AppModal } from '../components/AppModal';
import { Button } from '../components/Button';
import { DeckRow } from '../components/DeckRow';
import { PremiumLimitModal } from '../components/PremiumLimitModal';
import {
  listDecks,
  createDeck,
  deleteDeck,
  archiveDeck,
  setDeckCard,
  deckTotal,
  subscribe,
  type Deck,
} from '../lib/decks';
import { parseOptcgSim, defaultDeckName } from '../lib/optcgsim';
import { useLimit } from '../lib/entitlements';
import { useT } from '../lib/i18n';

export function DecksScreen({ navigation }: DecksScreenProps) {
  const t = useT();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);
  const [menuTarget, setMenuTarget] = useState<Deck | null>(null);
  const [showLimit, setShowLimit] = useState(false);
  const deckLimit = useLimit('decks');

  const refresh = useCallback(() => {
    listDecks().then(setDecks);
  }, []);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  // Los mazos archivados no cuentan contra el tope — es justo la alternativa
  // suave que se ofrece antes de negarse a crear uno nuevo. `listDecks()` ya
  // excluye lápidas, así que ambas listas son de mazos vivos.
  const activeDecks = decks.filter((d) => !d.archived);
  const archivedDecks = decks.filter((d) => d.archived);

  // Se compara con `>=`: quien venía de premium con más mazos que el tope los
  // conserva todos (nunca se borran ni se ocultan), simplemente no puede crear
  // otro hasta archivar o bajar del límite.
  const atLimit = deckLimit !== null && activeDecks.length >= deckLimit;

  /** Punto único de entrada a la creación: decide entre el formulario y el
   *  aviso de tope. Se pregunta ANTES de abrir el formulario — dejar que el
   *  usuario nombre un mazo para luego negárselo es peor que enseñarle el tope. */
  const guardedOpen = useCallback(
    (open: () => void) => {
      if (atLimit) {
        setShowLimit(true);
        return;
      }
      open();
    },
    [atLimit],
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    // Re-chequeo en el commit: el formulario puede llevar abierto mientras la
    // sync trae mazos de otro dispositivo y cruza el tope por debajo.
    if (atLimit) {
      setShowModal(false);
      setShowLimit(true);
      return;
    }
    const deck = await createDeck(newName);
    setShowModal(false);
    setNewName('');
    navigation.navigate('DeckDetail', { deckId: deck.id });
  }, [newName, navigation, atLimit]);

  const confirmDelete = useCallback(() => {
    if (deckToDelete) deleteDeck(deckToDelete.id);
    setDeckToDelete(null);
  }, [deckToDelete]);

  const toggleArchive = useCallback((deck: Deck) => {
    archiveDeck(deck.id, !deck.archived);
    setMenuTarget(null);
  }, []);

  const handleImport = useCallback(async () => {
    const entries = parseOptcgSim(importText);
    if (entries.length === 0) {
      Alert.alert(t('decks.importTitle'), t('decks.importedNone'));
      return;
    }
    // Importar crea un mazo igual que el formulario: mismo tope, mismo re-chequeo.
    if (atLimit) {
      setShowImport(false);
      setShowLimit(true);
      return;
    }
    const deck = await createDeck(newName.trim() || defaultDeckName(entries));
    for (const e of entries) await setDeckCard(deck.id, e.code, e.qty);
    setShowImport(false);
    setImportText('');
    setNewName('');
    navigation.navigate('DeckDetail', { deckId: deck.id });
  }, [importText, newName, navigation, t, atLimit]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {decks.length === 0 ? (
        <View style={s.empty}>
          <Icon name="binder" size={48} color={colors.textDim} />
          <Text style={s.emptyTitle}>{t('decks.emptyTitle')}</Text>
          <Text style={s.emptySub}>{t('decks.emptyBody')}</Text>
          <Pressable
            style={({ pressed }) => [s.createBtn, pressed && pressedStyle]}
            onPress={() => guardedOpen(() => setShowModal(true))}
            accessibilityRole="button"
            accessibilityLabel={t('decks.newDeck')}
          >
            <Icon name="plus" size={18} color="#fff" />
            <Text style={s.createBtnText}>{t('decks.newDeck')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.importBtn, pressed && pressedStyle]}
            onPress={() => guardedOpen(() => setShowImport(true))}
            accessibilityRole="button"
            accessibilityLabel={t('decks.importSim')}
          >
            <Icon name="external" size={18} color={colors.accent} />
            <Text style={s.importBtnText}>{t('decks.importSim')}</Text>
          </Pressable>
          {/* Mismo motivo que en el header del listado no-vacío: sin FAB
              central el escáner necesita una vía desde Decks, y el estado
              vacío (primera vez que se entra en la tab) es justo donde más
              falta hacía — antes sólo vivía en el ListHeaderComponent, que
              no se monta hasta que hay al menos un mazo. */}
          <Pressable
            style={({ pressed }) => [s.importBtn, pressed && pressedStyle]}
            onPress={() => navigation.navigate('Scan')}
            accessibilityRole="button"
            accessibilityLabel={t('home.scan')}
          >
            <Icon name="camera" size={18} color={colors.accent} />
            <Text style={s.importBtnText}>{t('home.scan')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={activeDecks}
          keyExtractor={(d) => d.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              {/* Al llegar al tope la fila no desaparece ni se deshabilita:
                  sigue pulsable y explica por qué. Un botón muerto deja al
                  usuario adivinando; el icono cambia a `sparkle` en vez de un
                  candado porque esto es una mejora ofrecida, no un castigo. */}
              <Pressable
                style={({ pressed }) => [s.newRow, atLimit && s.newRowLocked, pressed && pressedStyle]}
                onPress={() => guardedOpen(() => setShowModal(true))}
                accessibilityRole="button"
                accessibilityLabel={t('decks.newDeck')}
              >
                <Icon
                  name={atLimit ? 'sparkle' : 'plus'}
                  size={18}
                  color={atLimit ? colors.textMut : colors.accent}
                />
                <Text style={[s.newRowText, atLimit && s.newRowTextLocked]}>
                  {atLimit ? `${t('decks.newDeck')} · ${activeDecks.length}/${deckLimit}` : t('decks.newDeck')}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.newRow, atLimit && s.newRowLocked, pressed && pressedStyle]}
                onPress={() => guardedOpen(() => setShowImport(true))}
                accessibilityRole="button"
                accessibilityLabel={t('decks.importSim')}
              >
                <Icon
                  name={atLimit ? 'sparkle' : 'external'}
                  size={18}
                  color={atLimit ? colors.textMut : colors.accent}
                />
                <Text style={[s.newRowText, atLimit && s.newRowTextLocked]}>{t('decks.importSim')}</Text>
              </Pressable>
              {/* Escanear desde Decks: al quitar el FAB central, el escáner
                  sólo era alcanzable desde Browse/Binder/Home, y construir un
                  mazo con las cartas en la mano es justo cuando hace falta. */}
              <Pressable
                style={({ pressed }) => [s.newRow, pressed && pressedStyle]}
                onPress={() => navigation.navigate('Scan')}
                accessibilityRole="button"
                accessibilityLabel={t('home.scan')}
              >
                <Icon name="camera" size={18} color={colors.accent} />
                <Text style={s.newRowText}>{t('home.scan')}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <DeckRow
              deck={item}
              subtitle={`${item.cards.length} ${t('decks.slots')} · ${deckTotal(item)} ${t('decks.cards')}`}
              onPress={() => navigation.navigate('DeckDetail', { deckId: item.id })}
              onLongPress={() => setMenuTarget(item)}
              onMenuPress={() => setMenuTarget(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListFooterComponent={
            archivedDecks.length > 0 ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                <Text style={s.archivedLabel}>
                  {t('decks.archivedSection', { n: String(archivedDecks.length) })}
                </Text>
                {archivedDecks.map((d) => (
                  <View key={d.id} style={{ opacity: 0.6 }}>
                    <DeckRow
                      deck={d}
                      subtitle={`${d.cards.length} ${t('decks.slots')} · ${deckTotal(d)} ${t('decks.cards')}`}
                      onPress={() => navigation.navigate('DeckDetail', { deckId: d.id })}
                      onLongPress={() => setMenuTarget(d)}
                      onMenuPress={() => setMenuTarget(d)}
                    />
                  </View>
                ))}
              </View>
            ) : null
          }
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

      {/* Menú de opciones por mazo: archivar/restaurar (reversible, gratis)
          o borrar (destructivo, pide confirmación aparte). */}
      <AppModal visible={menuTarget !== null} onClose={() => setMenuTarget(null)} title={t('decks.optionsTitle')}>
        {menuTarget ? (
          <>
            <Text style={s.confirmBody}>
              {menuTarget.archived ? t('decks.restoreDesc') : t('decks.archiveDesc')}
            </Text>
            <View style={s.modalRow}>
              <Button
                title={menuTarget.archived ? t('decks.restore') : t('decks.archive')}
                variant="secondary"
                onPress={() => toggleArchive(menuTarget)}
                style={s.modalBtn}
              />
              <Button
                title={t('common.delete')}
                variant="danger"
                onPress={() => { setDeckToDelete(menuTarget); setMenuTarget(null); }}
                style={s.modalBtn}
              />
            </View>
          </>
        ) : null}
      </AppModal>

      <PremiumLimitModal
        visible={showLimit}
        onClose={() => setShowLimit(false)}
        title={t('premium.deckLimitTitle')}
        body={t('premium.deckLimitBody', { n: String(deckLimit ?? '') })}
      />

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
  newRowLocked: { borderStyle: 'solid', opacity: 0.7 },
  newRowTextLocked: { color: colors.textMut },

  sep: { height: spacing.sm },
  archivedLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

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
  createBtnText: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.onAccent },
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
    backgroundColor: 'rgba(21,22,26,0.85)',
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
  modalConfirmText: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.onAccent },
});
