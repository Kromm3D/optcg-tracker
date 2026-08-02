// ScanResultSheet — se muestra tras identificar una carta en el escáner.
// En vez de añadirla automáticamente a la colección, ofrece varios modos:
// ver ficha, añadir a un mazo, añadir a la colección (con stepper vía
// BulkTargetSheet) o abrir el precio en Cardmarket.

import React from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface } from '../theme';
import { Icon } from './Icon';
import { CardThumb } from './CardThumb';
import { useT } from '../lib/i18n';
import { buildCardmarketVariantUrl } from '../lib/cardmarket';
import type { Card, Variant } from '../types';

export type ScanResultAction = 'profile' | 'deck' | 'collection';

type Props = {
  visible: boolean;
  card: Card | null;
  variant: Variant | null;
  /** La lectura no llegó al suelo de confianza: puede no ser esta carta. */
  lowConfidence?: boolean;
  onClose: () => void;
  onAction: (action: ScanResultAction) => void;
};

export function ScanResultSheet({ visible, card, variant, lowConfidence, onClose, onAction }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();

  if (!card || !variant) return null;

  const handlePrice = () => {
    Linking.openURL(buildCardmarketVariantUrl(card.code, variant.suffix));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />

          <View style={s.header}>
            <CardThumb card={card} variant={variant} width={64} />
            <View style={s.headerInfo}>
              <Text style={s.name} numberOfLines={2}>{card.name}</Text>
              <Text style={s.code}>{card.code}{variant.suffix}</Text>
            </View>
          </View>

          {/* Lectura dudosa: el aviso va ANTES de las acciones, no como nota al
              pie, porque su único trabajo es que mires la miniatura antes de
              pulsar "añadir a la colección". */}
          {lowConfidence && (
            <View style={s.warn}>
              <Icon name="alert" size={16} color={colors.warn} />
              <Text style={s.warnText}>{t('scan.lowConfidence')}</Text>
            </View>
          )}

          <View style={s.actions}>
            <Pressable
              style={({ pressed }) => [s.actionRow, pressed && pressedSurface]}
              onPress={() => onAction('profile')}
              accessibilityRole="button"
              accessibilityLabel={t('scan.viewProfile')}
            >
              <Icon name="search" size={20} color={colors.accent} />
              <Text style={s.actionText}>{t('scan.viewProfile')}</Text>
              <Icon name="chevR" size={18} color={colors.textDim} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.actionRow, pressed && pressedSurface]}
              onPress={() => onAction('deck')}
              accessibilityRole="button"
              accessibilityLabel={t('scan.addToDeck')}
            >
              <Icon name="layers" size={20} color={colors.accent} />
              <Text style={s.actionText}>{t('scan.addToDeck')}</Text>
              <Icon name="chevR" size={18} color={colors.textDim} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.actionRow, pressed && pressedSurface]}
              onPress={() => onAction('collection')}
              accessibilityRole="button"
              accessibilityLabel={t('scan.addToCollection')}
            >
              <Icon name="archive" size={20} color={colors.accent} />
              <Text style={s.actionText}>{t('scan.addToCollection')}</Text>
              <Icon name="chevR" size={18} color={colors.textDim} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [s.actionRow, pressed && pressedSurface]}
              onPress={handlePrice}
              accessibilityRole="button"
              accessibilityLabel={t('scan.viewPrice')}
            >
              <Icon name="external" size={20} color={colors.accent} />
              <Text style={s.actionText}>{t('scan.viewPrice')}</Text>
              <Icon name="chevR" size={18} color={colors.textDim} />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [s.closeBtn, pressed && pressedStyle]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('scan.cancel')}
          >
            <Text style={s.closeText}>{t('scan.keepScanning')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21,22,26,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 14,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerInfo: { flex: 1, gap: 3 },
  name: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
  code: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.warn,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warnText: { flex: 1, fontSize: 13, fontFamily: fonts.ui, color: colors.text, lineHeight: 18 },
  actions: { gap: 8 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
  },
  actionText: { flex: 1, fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  closeBtn: { alignItems: 'center', paddingVertical: 10 },
  closeText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
});
