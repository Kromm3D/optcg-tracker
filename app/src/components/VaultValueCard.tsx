// Módulo de Home: valor del vault a lo largo del tiempo.
//
// Muestra el valor actual (en rosa = "valor", coherente con la app), un delta
// vs. la ventana elegida (verde/rojo semánticos `up`/`down`), una sparkline
// rosa y un selector 7D/30D/Todo. El valor es PRIVADO (no se comparte con
// amigos) — ver lib/valueHistory.ts.

import React, { useEffect, useReducer, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, type, pressedStyle, HIT_SLOP } from '../theme';
import { useT } from '../lib/i18n';
import { getSettings, setValueTimeframe, subscribe as subSettings, type ValueTimeframe } from '../lib/settings';
import {
  ALL_DAYS,
  getDelta,
  getDisplaySeries,
  recordDailySnapshot,
  subscribe as subValueHistory,
} from '../lib/valueHistory';
import { Sparkline } from './Sparkline';

const SPARK_H = 64;

const MONTHS: Record<'en' | 'es', string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

const TIMEFRAMES: { key: ValueTimeframe; label: 'home.tf7d' | 'home.tf30d' | 'home.tfAll'; days: number }[] = [
  { key: '7d', label: 'home.tf7d', days: 7 },
  { key: '30d', label: 'home.tf30d', days: 30 },
  { key: 'all', label: 'home.tfAll', days: ALL_DAYS },
];

/** Agrupa miles con coma; muestra 2 decimales solo por debajo de 100€. */
function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs < 100) return abs.toFixed(2);
  return abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 'YYYY-MM-DD' → fecha corta localizada ("Jun 3" / "3 jun"). */
function fmtDate(iso: string, lang: 'en' | 'es'): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const mon = MONTHS[lang][m - 1] ?? '';
  return lang === 'es' ? `${d} ${mon}` : `${mon} ${d}`;
}

export function VaultValueCard({ currentValue }: { currentValue: number }) {
  const t = useT();
  const [, bump] = useReducer((n) => n + 1, 0);
  const [tf, setTf] = useState<ValueTimeframe>(() => getSettings().valueTimeframe);
  const [sparkW, setSparkW] = useState(0);

  // Re-render cuando cambia el histórico o los settings (idioma/timeframe).
  useEffect(() => subValueHistory(bump), []);
  useEffect(() => subSettings(() => setTf(getSettings().valueTimeframe)), []);

  // Captura pasiva: registra el valor de hoy al montar / cuando cambie.
  // Evita el falso 0 previo a la hidratación de la colección (>0 guard).
  useEffect(() => {
    if (currentValue > 0) recordDailySnapshot(currentValue);
  }, [currentValue]);

  const lang = getSettings().language;
  const active = TIMEFRAMES.find((x) => x.key === tf) ?? TIMEFRAMES[0];
  const delta = getDelta(currentValue, active.days);
  const series = getDisplaySeries(currentValue, active.days);

  const onLayout = (e: LayoutChangeEvent) => setSparkW(e.nativeEvent.layout.width);

  // ── Delta badge ──────────────────────────────────────────────────────────
  let badge: React.ReactNode = null;
  if (delta) {
    const isUp = delta.amount > 0.005;
    const isDown = delta.amount < -0.005;
    const dColor = isUp ? colors.up : isDown ? colors.down : colors.textMut;
    const dBg = isUp
      ? 'rgba(78,201,139,0.14)'
      : isDown
      ? 'rgba(239,93,107,0.14)'
      : colors.surface2;
    const arrow = isUp ? '↑' : isDown ? '↓' : '→';
    const sign = isUp ? '+' : isDown ? '−' : '';
    badge = (
      <View style={[s.badge, { backgroundColor: dBg }]}>
        <Text style={[s.badgeText, { color: dColor }]}>
          {arrow} {sign}€{fmtMoney(delta.amount)} · {Math.abs(delta.pct).toFixed(1)}%
        </Text>
      </View>
    );
  }

  // ── Caption (label de la ventana temporal) ───────────────────────────────
  let caption: string;
  if (!delta) {
    caption = '';
  } else if (tf === 'all') {
    caption = t('home.vaultAllTime');
  } else if (delta.full) {
    caption = tf === '7d' ? t('home.vaultPast7d') : t('home.vaultPast30d');
  } else {
    caption = t('home.vaultSince', { date: fmtDate(delta.fromDate, lang) });
  }

  return (
    <View
      style={s.card}
      accessibilityRole="summary"
      accessibilityLabel={`${t('home.vaultA11y')}: €${fmtMoney(currentValue)}`}
    >
      <View style={s.topRow}>
        <View style={s.labelWrap}>
          <View style={s.coin}>
            <Text style={s.coinText}>€</Text>
          </View>
          <Text style={s.label}>{t('home.vaultValue')}</Text>
        </View>
        {badge}
      </View>

      <View style={s.valueRow}>
        <Text style={s.value}>€{fmtMoney(currentValue)}</Text>
        {caption ? <Text style={s.caption}>{caption}</Text> : null}
      </View>

      {/* Sparkline o estado first-run */}
      <View style={s.sparkWrap} onLayout={onLayout}>
        {delta && sparkW > 0 ? (
          <Sparkline
            data={series}
            width={sparkW}
            height={SPARK_H}
            color={colors.accent}
            gradientId="vaultSpark"
          />
        ) : !delta ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>{t('home.vaultTrackingStarts')}</Text>
          </View>
        ) : null}
      </View>

      {/* Selector de ventana (solo si hay histórico que mostrar) */}
      {delta ? (
        <View style={s.tfRow}>
          {TIMEFRAMES.map((x) => {
            const isActive = x.key === tf;
            return (
              <Pressable
                key={x.key}
                onPress={() => {
                  setTf(x.key);
                  setValueTimeframe(x.key);
                }}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [s.tfBtn, pressed && pressedStyle]}
              >
                <Text style={[s.tfText, isActive && s.tfTextActive]}>{t(x.label)}</Text>
                <View style={[s.tfUnderline, isActive && s.tfUnderlineActive]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Price disclaimer — the vault figure is an aggregate of estimates. */}
      <Text style={s.disclaimer}>{t('home.priceDisclaimer')}</Text>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: {
    color: colors.accent,
    fontSize: type.caption,
    fontFamily: fonts.uiBold,
    marginTop: -1,
  },
  label: {
    color: colors.textMut,
    fontSize: type.caption,
    fontFamily: fonts.ui,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: type.caption,
    fontFamily: fonts.uiSemi,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  value: {
    color: colors.accent,
    fontSize: 34,
    fontFamily: fonts.display,
    letterSpacing: -0.8,
  },
  caption: {
    color: colors.textDim,
    fontSize: type.caption,
    fontFamily: fonts.ui,
  },
  sparkWrap: {
    height: SPARK_H,
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: type.caption,
    fontFamily: fonts.ui,
  },
  tfRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tfBtn: { alignItems: 'center', gap: 4, paddingBottom: 2 },
  tfText: {
    color: colors.textMut,
    fontSize: type.caption,
    fontFamily: fonts.uiSemi,
  },
  tfTextActive: { color: colors.accent },
  disclaimer: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: fonts.ui,
    marginTop: 2,
  },
  tfUnderline: {
    height: 2,
    width: 18,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  tfUnderlineActive: { backgroundColor: colors.accent },
});
