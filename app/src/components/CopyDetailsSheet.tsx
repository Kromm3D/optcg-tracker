// CopyDetailsSheet — edita los metadatos físicos de las copias que tienes de
// una variante: estado, idioma, gradeo y lo que pagaste por copia.
//
// Es información **por variante**, no por copia suelta (ver la nota de modelo
// en types.ts → CollectionItem). Si no tienes ninguna copia, la hoja no se
// abre: no hay montón que describir.

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, spacing, pressedStyle } from '../theme';
import { useT } from '../lib/i18n';
import { getMetaSync, setMeta, type CollectionMeta } from '../lib/collection';
import { currencySymbol, fromEur, toEur } from '../lib/currency';
import { isFeatureEnabled } from '../lib/settings';
import { CONDITION_MULTIPLIER } from '../lib/prices';
import type { CardCondition, CardLanguage } from '../types';

const CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const LANGUAGES: CardLanguage[] = ['EN', 'JP', 'ES', 'FR', 'DE', 'IT', 'CN', 'KR'];
const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC'];

type Props = {
  visible: boolean;
  code: string;
  suffix: string;
  onClose: () => void;
};

export function CopyDetailsSheet({ visible, code, suffix, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();

  const [meta, setLocalMeta] = useState<CollectionMeta>({});
  // El campo de precio se edita como texto: un TextInput numérico controlado
  // por un number no deja escribir "12." ni un decimal a medias.
  const [priceText, setPriceText] = useState('');

  // Al abrir, se hidrata desde la colección. Cerrar y reabrir descarta lo no
  // guardado, que es el comportamiento esperado de una hoja con "Guardar".
  useEffect(() => {
    if (!visible) return;
    const m = getMetaSync(code, suffix);
    setLocalMeta(m);
    setPriceText(m.acquiredUnitPrice != null ? fromEur(m.acquiredUnitPrice).toFixed(2) : '');
  }, [visible, code, suffix]);

  const parsedPrice = useMemo(() => {
    const n = parseFloat(priceText.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [priceText]);

  const save = async () => {
    await setMeta(code, suffix, {
      condition: meta.condition ?? null,
      language: meta.language ?? null,
      graded: meta.graded ?? null,
      // El coste se guarda SIEMPRE en EUR (divisa base); el usuario lo teclea
      // en la suya. Vaciar el campo borra el coste y saca la carta del P&L.
      acquiredUnitPrice: parsedPrice == null ? null : toEur(parsedPrice),
      acquiredAt: parsedPrice == null ? null : (meta.acquiredAt ?? Date.now()),
    });
    onClose();
  };

  const toggleGraded = (on: boolean) =>
    setLocalMeta((m) => ({ ...m, graded: on ? (m.graded ?? { company: 'PSA', grade: 10 }) : undefined }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>{t('copy.title')}</Text>
          <Text style={s.subtitle}>{code}{suffix}</Text>

          <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
            {/* ── Estado ──────────────────────────────────────────────── */}
            {isFeatureEnabled('condition') ? (
              <>
            <Text style={s.section}>{t('copy.condition')}</Text>
            <View style={s.chipRow}>
              {CONDITIONS.map((c) => {
                const on = meta.condition === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setLocalMeta((m) => ({ ...m, condition: on ? undefined : c }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{c}</Text>
                    {/* El descuento de valor es la razón de ser del campo:
                        mostrarlo evita que el usuario lo marque a ciegas. */}
                    <Text style={[s.chipHint, on && s.chipTextOn]}>
                      {Math.round(CONDITION_MULTIPLIER[c] * 100)}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>

              </>
            ) : null}

            {/* ── Idioma ──────────────────────────────────────────────── */}
            {/* El idioma va con el estado: ambos describen la copia física y
                no tiene sentido enseñar uno sin el otro. */}
            {isFeatureEnabled('condition') ? (
              <>
            <Text style={s.section}>{t('copy.language')}</Text>
            <View style={s.chipRow}>
              {LANGUAGES.map((l) => {
                const on = meta.language === l;
                return (
                  <Pressable
                    key={l}
                    onPress={() => setLocalMeta((m) => ({ ...m, language: on ? undefined : l }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>

              </>
            ) : null}

            {/* ── Gradeo ──────────────────────────────────────────────── */}
            {isFeatureEnabled('grading') ? (
              <>
            <View style={s.switchRow}>
              <Text style={s.section}>{t('copy.graded')}</Text>
              <Switch
                value={!!meta.graded}
                onValueChange={toggleGraded}
                trackColor={{ true: colors.accentDim, false: colors.surface2 }}
                thumbColor={meta.graded ? colors.accent : colors.textDim}
              />
            </View>
            {meta.graded ? (
              <>
                <View style={s.chipRow}>
                  {GRADERS.map((g) => {
                    const on = meta.graded?.company === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() =>
                          setLocalMeta((m) => ({ ...m, graded: { ...(m.graded ?? { grade: 10 }), company: g } }))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                      >
                        <Text style={[s.chipText, on && s.chipTextOn]}>{g}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>{t('copy.grade')}</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="decimal-pad"
                    value={String(meta.graded.grade)}
                    onChangeText={(v) => {
                      const n = parseFloat(v.replace(',', '.'));
                      setLocalMeta((m) => ({
                        ...m,
                        graded: { ...(m.graded ?? { company: 'PSA' }), grade: Number.isFinite(n) ? n : 0 },
                      }));
                    }}
                    placeholderTextColor={colors.textDim}
                    accessibilityLabel={t('copy.grade')}
                  />
                </View>
              </>
            ) : null}

              </>
            ) : null}

            {/* ── Coste base ──────────────────────────────────────────── */}
            {isFeatureEnabled('costBasis') ? (
              <>
            <Text style={s.section}>{t('copy.paid')}</Text>
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>{currencySymbol()}</Text>
              <TextInput
                style={s.input}
                keyboardType="decimal-pad"
                value={priceText}
                onChangeText={setPriceText}
                placeholder="0.00"
                placeholderTextColor={colors.textDim}
                accessibilityLabel={t('copy.paid')}
              />
            </View>
            <Text style={s.hint}>{t('copy.paidHint')}</Text>
              </>
            ) : null}
          </ScrollView>

          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [s.cancelBtn, pressed && pressedStyle]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={s.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.saveBtn, pressed && pressedStyle]}
              onPress={save}
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
    maxHeight: '86%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 17, fontFamily: fonts.display, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, marginTop: -6 },
  scroll: { flexGrow: 0 },
  section: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.text },
  chipTextOn: { color: colors.onAccent },
  chipHint: { fontSize: 10, fontFamily: fonts.ui, color: colors.textDim },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  hint: { fontSize: 11, fontFamily: fonts.ui, color: colors.textDim, marginTop: 6 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radii.lg, backgroundColor: colors.surface2 },
  cancelText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radii.lg, backgroundColor: colors.accent },
  saveText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.onAccent },
});
