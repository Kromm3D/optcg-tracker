// PriceChart — histórico de precio de una variante concreta.
//
// La app ya calculaba el % de variación entre las dos últimas publicaciones,
// pero no enseñaba la forma de la curva: "+3%" no distingue una carta que sube
// despacio desde hace meses de una que rebota. Aquí se pinta la serie que
// lib/priceHistory acumula por carta seguida.
//
// El histórico se construye con el uso: hasta la segunda publicación de
// precios no hay dos puntos que unir. Ese estado se dice explícitamente en vez
// de dibujar una línea plana, que se leería como "el precio no se mueve".

import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing, type } from '../theme';
import { useT } from '../lib/i18n';
import { formatEur } from '../lib/currency';
import { getPriceSeries } from '../lib/priceHistory';
import { Sparkline } from './Sparkline';

const CHART_H = 72;
/** Con un solo punto no hay curva: hacen falta dos publicaciones. */
const MIN_POINTS = 2;

export function PriceChart({ code, suffix }: { code: string; suffix: string }) {
  const t = useT();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const series = useMemo(() => getPriceSeries(code, suffix), [code, suffix]);

  // Sin ningún precio real (carta con estimación por rareza) no hay nada
  // honesto que graficar.
  if (series.length === 0) return null;

  const prices = series.map((p) => p.price);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = changePct > 0.05;
  const down = changePct < -0.05;
  const lineColor = up ? colors.up : down ? colors.down : colors.accent;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.label}>{t('detail.priceHistory')}</Text>
        <Text style={s.now}>{formatEur(last)}</Text>
      </View>

      <View style={s.chartWrap} onLayout={onLayout}>
        {series.length >= MIN_POINTS && width > 0 ? (
          <Sparkline
            data={prices}
            width={width}
            height={CHART_H}
            color={lineColor}
            gradientId={`price-${code}${suffix}`}
          />
        ) : (
          <Text style={s.empty}>{t('detail.priceHistoryEmpty')}</Text>
        )}
      </View>

      {series.length >= MIN_POINTS ? (
        <Text style={[s.delta, { color: lineColor }]}>
          {t('detail.priceHistorySpan', {
            n: series.length,
            pct: `${changePct >= 0 ? '+' : '−'}${Math.abs(changePct).toFixed(1)}%`,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: {
    color: colors.textMut,
    fontSize: type.caption,
    fontFamily: fonts.ui,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  now: { color: colors.text, fontSize: 17, fontFamily: fonts.display },
  chartWrap: { height: CHART_H, justifyContent: 'center' },
  empty: { color: colors.textDim, fontSize: type.caption, fontFamily: fonts.ui },
  delta: { fontSize: type.caption, fontFamily: fonts.uiSemi },
});
