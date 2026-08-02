// BulkScanSheet — revisión de la cola del modo BULK del escáner.
//
// Catalogar un sobre entero carta a carta, confirmando cada una, es la parte
// tediosa que hace que la gente no catalogue. El modo BULK escanea sin
// preguntar y deja el trabajo aquí: una lista donde se corrige lo que salió
// mal y se añade todo de una vez.
//
// La revisión NO es opcional a propósito. El escáner acierta lo bastante para
// ahorrar tecleo, no lo bastante para meter cartas en la colección de alguien
// a ciegas: una carta mal reconocida que entra sin que nadie la vea es un dato
// corrupto que el usuario descubrirá meses después, si lo descubre.

import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, pressedStyle } from '../theme';
import { Icon } from './Icon';
import { CachedImage } from './CachedImage';
import { Counter } from './Counter';
import { useT } from '../lib/i18n';
import { resolveImageUris } from '../lib/images';
import type { Card, Variant } from '../types';

export type BulkScanEntry = {
  code: string;
  suffix: string;
  card: Card;
  variant: Variant;
  qty: number;
};

type Props = {
  visible: boolean;
  entries: BulkScanEntry[];
  onClose: () => void;
  /** Cambia la cantidad de una entrada; a 0 se elimina de la cola. */
  onAdjust: (code: string, suffix: string, delta: number) => void;
  /** Añade todo a la colección y vacía la cola. */
  onConfirm: () => void;
};

export function BulkScanSheet({ visible, entries, onClose, onAdjust, onConfirm }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();

  const total = entries.reduce((n, e) => n + e.qty, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('scan.bulkQueue')}</Text>
          <Text style={s.subtitle}>{t('scan.bulkQueueCount', { n: entries.length, total })}</Text>

          {entries.length === 0 ? (
            <View style={s.empty}>
              <Icon name="camera" size={26} color={colors.textDim} />
              <Text style={s.emptyText}>{t('scan.bulkEmpty')}</Text>
            </View>
          ) : (
            <FlatList
              data={entries}
              style={s.list}
              keyExtractor={(e) => `${e.code}${e.suffix}`}
              renderItem={({ item }) => {
                const { uri, fallback } = resolveImageUris(item.variant);
                return (
                  <View style={s.row}>
                    <CachedImage uri={uri} fallbackUri={fallback} style={s.thumb} placeholderBg={colors.surface2} />
                    <View style={s.rowInfo}>
                      <Text style={s.rowName} numberOfLines={1}>{item.card.name}</Text>
                      <Text style={s.rowCode}>{item.code}{item.suffix}</Text>
                    </View>
                    <Counter
                      value={item.qty}
                      onAdjust={(d) => onAdjust(item.code, item.suffix, d)}
                      size="sm"
                      label={item.code}
                    />
                  </View>
                );
              }}
            />
          )}

          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [s.cancelBtn, pressed && pressedStyle]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={s.cancelText}>{t('scan.keepScanning')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.confirmBtn,
                entries.length === 0 && { opacity: 0.4 },
                pressed && pressedStyle,
              ]}
              onPress={onConfirm}
              disabled={entries.length === 0}
              accessibilityRole="button"
            >
              <Text style={s.confirmText}>{t('scan.bulkAddAll', { total })}</Text>
            </Pressable>
          </View>
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
    gap: 10,
    maxHeight: '80%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, marginTop: -6 },
  list: { flexGrow: 0, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: { width: 38, height: 53, borderRadius: radii.sm },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.text },
  rowCode: { fontSize: 11, fontFamily: fonts.ui, color: colors.textMut },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyText: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radii.lg, backgroundColor: colors.surface2 },
  cancelText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
  confirmBtn: { flex: 1.4, alignItems: 'center', paddingVertical: 13, borderRadius: radii.lg, backgroundColor: colors.accent },
  confirmText: { fontSize: 14, fontFamily: fonts.uiBold, color: colors.onAccent },
});
