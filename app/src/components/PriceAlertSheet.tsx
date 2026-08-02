// PriceAlertSheet — fijar (o quitar) el precio objetivo de una carta.
//
// Se abre desde la wishlist. El objetivo se teclea en la divisa del usuario y
// se guarda en EUR; el precio actual se muestra al lado para que el número no
// se escriba a ciegas.

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, pressedStyle } from '../theme';
import { useT } from '../lib/i18n';
import { CARDS } from '../data/loadIndex';
import { currencySymbol, formatEur, fromEur, toEur } from '../lib/currency';
import { getPrice, hasRealPrice } from '../lib/prices';
import { getAlertSync, isNotificationsAvailable, removeAlert, setAlert } from '../lib/priceAlerts';

type Props = {
  /** null = hoja cerrada. */
  target: { code: string; suffix: string; name: string } | null;
  onClose: () => void;
};

export function PriceAlertSheet({ target, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const card = target ? CARDS[target.code] : null;
  const currentEur = card ? getPrice(card, target!.suffix) : 0;
  const isReal = card ? hasRealPrice(card, target!.suffix) : false;
  const existing = target ? getAlertSync(target.code, target.suffix) : null;

  useEffect(() => {
    if (!target) return;
    const a = getAlertSync(target.code, target.suffix);
    // Sugerencia por defecto: un 20 % por debajo del precio actual. Es un
    // punto de partida para editar, no una recomendación de compra.
    const seed = a ? a.targetEur : currentEur * 0.8;
    setText(fromEur(seed).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.code, target?.suffix]);

  const parsed = useMemo(() => {
    const n = parseFloat(text.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [text]);

  if (!target || !card) return null;

  const save = async () => {
    if (parsed == null) return;
    await setAlert(target.code, target.suffix, toEur(parsed));
    onClose();
  };

  const clear = async () => {
    await removeAlert(target.code, target.suffix);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('alert.title')}</Text>
          <Text style={s.subtitle}>{target.name} · {target.code}{target.suffix}</Text>

          <View style={s.currentRow}>
            <Text style={s.currentLabel}>{t('alert.currentPrice')}</Text>
            <Text style={s.currentValue}>{formatEur(currentEur)}</Text>
          </View>
          {/* Sin precio real la alerta nunca saltaría (ver getTriggeredAlerts):
              mejor decirlo aquí que dejar al usuario esperando un aviso. */}
          {!isReal ? <Text style={s.warn}>{t('alert.noRealPrice')}</Text> : null}

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{currencySymbol()}</Text>
            <TextInput
              style={s.input}
              keyboardType="decimal-pad"
              value={text}
              onChangeText={setText}
              placeholder="0.00"
              placeholderTextColor={colors.textDim}
              accessibilityLabel={t('alert.setTarget')}
              autoFocus
            />
          </View>

          <Text style={s.hint}>
            {isNotificationsAvailable() ? t('alert.hintPush') : t('alert.hintInApp')}
          </Text>

          <View style={s.footer}>
            {existing ? (
              <Pressable
                style={({ pressed }) => [s.cancelBtn, pressed && pressedStyle]}
                onPress={clear}
                accessibilityRole="button"
              >
                <Text style={s.cancelText}>{t('alert.remove')}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [s.cancelBtn, pressed && pressedStyle]}
                onPress={onClose}
                accessibilityRole="button"
              >
                <Text style={s.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [s.saveBtn, parsed == null && { opacity: 0.4 }, pressed && pressedStyle]}
              onPress={save}
              disabled={parsed == null}
              accessibilityRole="button"
            >
              <Text style={s.saveText}>{t('common.save')}</Text>
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
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, marginTop: -6 },
  currentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  currentLabel: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  currentValue: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
  warn: { fontSize: 11, fontFamily: fonts.ui, color: colors.down },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
  },
  fieldLabel: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.textMut },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: fonts.ui, color: colors.text },
  hint: { fontSize: 11, fontFamily: fonts.ui, color: colors.textDim },
  footer: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radii.lg, backgroundColor: colors.surface2 },
  cancelText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radii.lg, backgroundColor: colors.accent },
  saveText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.onAccent },
});
