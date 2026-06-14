// WishlistPickerModal — lets user choose an existing wishlist or create a new one.
// Used when adding cards from DeckDetail ("Add missing") or from DetailScreen (heart).

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import {
  listWishlists,
  createWishlist,
  subscribe,
} from '../lib/wishlists';
import type { Wishlist } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called when the user has chosen (or just created) a wishlist. */
  onSelect: (wishlist: Wishlist) => void;
};

export function WishlistPickerModal({ visible, onClose, onSelect }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const refresh = () => listWishlists().then(setWishlists);

  useEffect(() => {
    if (visible) { refresh(); setCreating(false); setNewName(''); }
    return subscribe(refresh);
  }, [visible]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const wl = await createWishlist(newName.trim());
    setCreating(false);
    setNewName('');
    onSelect(wl);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('wl.pickTitle')}</Text>
          <Text style={s.subtitle}>{t('wl.pickBody')}</Text>

          <ScrollView style={s.list} contentContainerStyle={{ gap: 8 }}>
            {wishlists.map((wl) => (
              <Pressable
                key={wl.id}
                style={({ pressed }) => [s.item, pressed && pressedSurface]}
                onPress={() => onSelect(wl)}
                accessibilityRole="button"
                accessibilityLabel={wl.name}
              >
                <Icon name="binder" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{wl.name}</Text>
                  <Text style={s.itemMeta}>
                    {t('wl.cardsCount', { n: Object.keys(wl.cards).length })}
                  </Text>
                </View>
                <Icon name="chevR" size={16} color={colors.textMut} />
              </Pressable>
            ))}

            {wishlists.length === 0 && !creating && (
              <Text style={s.empty}>{t('wl.noWishlists')}</Text>
            )}
          </ScrollView>

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
                onSubmitEditing={handleCreate}
              />
              <View style={s.createBtns}>
                <Pressable
                  style={({ pressed }) => [s.cancelBtn, pressed && pressedStyle]}
                  onPress={() => setCreating(false)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={s.cancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.confirmBtn, !newName.trim() && { opacity: 0.4 }, pressed && pressedStyle]}
                  onPress={handleCreate}
                  disabled={!newName.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t('wl.create')}
                >
                  <Text style={s.confirmText}>{t('wl.create')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [s.newBtn, pressed && pressedStyle]}
              onPress={() => setCreating(true)}
              accessibilityRole="button"
              accessibilityLabel={t('wl.newWishlist')}
            >
              <Icon name="plus" size={18} color="#fff" />
              <Text style={s.newBtnText}>{t('wl.newWishlist')}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,12,26,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 12,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  list: { maxHeight: 260 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
  },
  itemName: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  itemMeta: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  empty: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center', paddingVertical: 16 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.xl,
    paddingVertical: 14,
  },
  newBtnText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
  createBox: { gap: 10 },
  nameInput: {
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fonts.ui,
    color: colors.text,
  },
  createBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: 14, fontFamily: fonts.uiBold, color: '#fff' },
});
