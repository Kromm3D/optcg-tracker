// Aviso de tope del plan gratuito. Un único sitio para la copia y el estilo
// de TODOS los gates de entitlements (decks, wishlists, y los que vengan) —
// antes de este componente cada pantalla llevaba su propia copia del mismo
// AppModal de tres frases, y con 4+ sitios creando wishlists habría sido
// cuatro copias más.
//
// Siempre las mismas tres frases, en este orden: el número del tope, la
// promesa de que los datos existentes no se tocan, y la admisión de que
// premium todavía no se puede comprar. Un botón "Desbloquear" que no lleva a
// ningún sitio sería peor que no ofrecerlo — ver lib/entitlements.ts.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppModal } from './AppModal';
import { Button } from './Button';
import { colors, fonts } from '../theme';
import { useT } from '../lib/i18n';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Frase con el número del tope ya interpolado, p.ej. "El plan gratuito incluye 5 mazos." */
  body: string;
};

export function PremiumLimitModal({ visible, onClose, title, body }: Props) {
  const t = useT();
  return (
    <AppModal visible={visible} onClose={onClose} title={title}>
      <Text style={s.body}>{body}</Text>
      <Text style={s.note}>{t('premium.dataSafe')}</Text>
      <Text style={s.note}>{t('premium.soon')}</Text>
      <View style={s.row}>
        <Button title={t('premium.gotIt')} onPress={onClose} style={s.btn} />
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  body: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, lineHeight: 21 },
  note: { fontSize: 13, fontFamily: fonts.ui, color: colors.textDim, lineHeight: 19 },
  row: { flexDirection: 'row' },
  btn: { flex: 1 },
});
