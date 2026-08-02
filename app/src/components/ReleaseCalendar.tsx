// ReleaseCalendar — próximo lanzamiento + los últimos publicados.
//
// Un coleccionista planifica compras: saber que en tres semanas sale un set
// cambia qué hace con el presupuesto de esta semana. La fecha ya vivía en
// lib/setMeta (la usa SetDetail), pero enterrada dentro de la ficha de cada
// set: había que saber que un set existe para descubrir cuándo sale.
//
// El bloque "próximo" sólo aparece si hay una fecha futura en la tabla. No se
// inventa nada ni se extrapola una cadencia trimestral: una fecha inventada en
// una app de coleccionismo es peor que ninguna fecha.

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, pressedSurface } from '../theme';
import { Icon } from './Icon';
import { SetBadge } from './SetBadge';
import { useT } from '../lib/i18n';
import { getSettings } from '../lib/settings';
import { setsByReleaseDate } from '../lib/setMeta';

const MONTHS: Record<'en' | 'es', string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

/** Cuántos sets ya publicados se listan bajo el próximo. */
const RECENT_COUNT = 3;

function fmt(date: Date, lang: 'en' | 'es'): string {
  const mon = MONTHS[lang][date.getMonth()] ?? '';
  return lang === 'es'
    ? `${date.getDate()} ${mon} ${date.getFullYear()}`
    : `${mon} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Días completos entre hoy y `date`, normalizando a medianoche para que un
 *  set que sale mañana no diga "en 0 días" según la hora a la que se mire. */
function daysUntil(date: Date): number {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(date) - midnight(new Date())) / 86_400_000);
}

export function ReleaseCalendar({ onOpenSet }: { onOpenSet: (setCode: string) => void }) {
  const t = useT();
  const lang = getSettings().language;

  const { upcoming, recent } = useMemo(() => {
    const all = setsByReleaseDate(); // más reciente primero
    const future = all.filter((s) => daysUntil(s.date) > 0).reverse(); // el más próximo primero
    return {
      upcoming: future[0] ?? null,
      recent: all.filter((s) => daysUntil(s.date) <= 0).slice(0, RECENT_COUNT),
    };
  }, []);

  // Sin fechas de ningún tipo no hay módulo que enseñar.
  if (!upcoming && recent.length === 0) return null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Icon name="sets" size={16} color={colors.textMut} />
        <Text style={s.headText}>{t('home.releases')}</Text>
      </View>

      {upcoming ? (
        <Pressable
          style={({ pressed }) => [s.next, pressed && pressedSurface]}
          onPress={() => onOpenSet(upcoming.code)}
          accessibilityRole="button"
          accessibilityLabel={upcoming.name}
        >
          <SetBadge setCode={upcoming.code} />
          <View style={{ flex: 1 }}>
            <Text style={s.nextName} numberOfLines={1}>{upcoming.name}</Text>
            <Text style={s.nextDate}>{fmt(upcoming.date, lang)}</Text>
          </View>
          <View style={s.countdown}>
            <Text style={s.countdownNum}>{daysUntil(upcoming.date)}</Text>
            <Text style={s.countdownUnit}>{t('home.daysShort')}</Text>
          </View>
        </Pressable>
      ) : (
        <Text style={s.none}>{t('home.noUpcoming')}</Text>
      )}

      {recent.map((r) => (
        <Pressable
          key={r.code}
          style={({ pressed }) => [s.row, pressed && pressedSurface]}
          onPress={() => onOpenSet(r.code)}
          accessibilityRole="button"
          accessibilityLabel={r.name}
        >
          <Text style={s.rowCode}>{r.code}</Text>
          <Text style={s.rowName} numberOfLines={1}>{r.name}</Text>
          <Text style={s.rowDate}>{fmt(r.date, lang)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headText: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accentDim,
    borderRadius: radii.lg,
    padding: 12,
  },
  nextName: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.text },
  nextDate: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  countdown: { alignItems: 'center' },
  countdownNum: { fontSize: 22, fontFamily: fonts.display, color: colors.accent, letterSpacing: -0.5 },
  countdownUnit: { fontSize: 10, fontFamily: fonts.ui, color: colors.textMut, marginTop: -2 },
  none: { fontSize: 13, fontFamily: fonts.ui, color: colors.textDim },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  rowCode: { fontSize: 11, fontFamily: fonts.uiBold, color: colors.textMut, width: 44 },
  rowName: { flex: 1, fontSize: 13, fontFamily: fonts.ui, color: colors.text },
  rowDate: { fontSize: 11, fontFamily: fonts.ui, color: colors.textDim },
});
