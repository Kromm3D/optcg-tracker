// DeckStats — resumen visual de un mazo: curva de coste, reparto de color y
// conteo por tipo. Todo local (sin red), a partir de las cartas del mazo.
// Se muestra como cabecera de la cuadrícula en DeckDetailScreen.

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Card } from '../types';
import { colors, fonts, radii, spacing, OPTCG_COLORS, COLOR_KEYS, colorOf } from '../theme';
import { useT } from '../lib/i18n';

export type DeckStatItem = { card: Card; qty: number };

const MAX_COST = 7; // el último bucket agrupa "7+"

export function DeckStats({ items }: { items: DeckStatItem[] }) {
  const t = useT();

  const stats = useMemo(() => {
    const nonLeader = items.filter((i) => i.card.type !== 'Leader');
    const totalCards = nonLeader.reduce((s, i) => s + i.qty, 0);

    // Conteo por tipo (líder aparte, se muestra como identidad del mazo).
    const typeCounts = { Character: 0, Event: 0, Stage: 0 };
    for (const { card, qty } of nonLeader) {
      if (card.type === 'Character') typeCounts.Character += qty;
      else if (card.type === 'Event') typeCounts.Event += qty;
      else if (card.type === 'Stage') typeCounts.Stage += qty;
    }

    // Curva de coste: buckets 0..7 (7 = 7+). Solo cartas con coste numérico.
    const curve = new Array(MAX_COST + 1).fill(0) as number[];
    for (const { card, qty } of nonLeader) {
      if (typeof card.cost === 'number') {
        curve[Math.min(card.cost, MAX_COST)] += qty;
      }
    }
    const curveMax = Math.max(1, ...curve);

    // Reparto de color: una carta multicolor suma a cada uno de sus colores.
    const colorCounts: Record<string, number> = {};
    for (const { card, qty } of nonLeader) {
      for (const c of card.colors ?? []) {
        if (OPTCG_COLORS[c]) colorCounts[c] = (colorCounts[c] ?? 0) + qty;
      }
    }
    const colorTotal = Object.values(colorCounts).reduce((s, n) => s + n, 0);

    const leader = items.find((i) => i.card.type === 'Leader')?.card;

    return { totalCards, typeCounts, curve, curveMax, colorCounts, colorTotal, leader };
  }, [items]);

  if (stats.totalCards === 0) return null;

  return (
    <View style={s.card}>
      {/* Encabezado: título + líder */}
      <View style={s.headerRow}>
        <Text style={s.title}>{t('deck.stats')}</Text>
        {stats.leader ? (
          <Text style={s.leader} numberOfLines={1}>
            {t('deck.typeLeader')}: {stats.leader.name}
          </Text>
        ) : null}
      </View>

      {/* Conteo por tipo */}
      <View style={s.typeRow}>
        <TypeChip label={t('deck.typeCharacter')} n={stats.typeCounts.Character} />
        <TypeChip label={t('deck.typeEvent')} n={stats.typeCounts.Event} />
        <TypeChip label={t('deck.typeStage')} n={stats.typeCounts.Stage} />
      </View>

      {/* Curva de coste */}
      <Text style={s.sectionLabel}>{t('deck.costCurve')}</Text>
      <View style={s.curve}>
        {stats.curve.map((count, cost) => {
          const h = 4 + Math.round((count / stats.curveMax) * 44);
          return (
            <View key={cost} style={s.curveCol}>
              <Text style={s.curveCount}>{count > 0 ? count : ''}</Text>
              <View style={[s.curveBar, { height: h, opacity: count > 0 ? 1 : 0.25 }]} />
              <Text style={s.curveAxis}>{cost === MAX_COST ? `${MAX_COST}+` : cost}</Text>
            </View>
          );
        })}
      </View>

      {/* Reparto de color */}
      {stats.colorTotal > 0 ? (
        <>
          <Text style={s.sectionLabel}>{t('deck.colors')}</Text>
          <View style={s.colorBar}>
            {COLOR_KEYS.filter((k) => stats.colorCounts[k]).map((k) => (
              <View
                key={k}
                style={{
                  flex: stats.colorCounts[k],
                  backgroundColor: colorOf(k),
                  height: '100%',
                }}
              />
            ))}
          </View>
          <View style={s.legend}>
            {COLOR_KEYS.filter((k) => stats.colorCounts[k]).map((k) => (
              <View key={k} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: colorOf(k) }]} />
                <Text style={s.legendText}>
                  {OPTCG_COLORS[k].name} {stats.colorCounts[k]}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function TypeChip({ label, n }: { label: string; n: number }) {
  return (
    <View style={s.typeChip}>
      <Text style={s.typeN}>{n}</Text>
      <Text style={s.typeLabel}>{label}</Text>
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
    gap: 12,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.text },
  leader: { flex: 1, fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'right' },

  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radii.lg,
    paddingVertical: 8,
  },
  typeN: { fontSize: 18, fontFamily: fonts.display, color: colors.text },
  typeLabel: { fontSize: 11, fontFamily: fonts.ui, color: colors.textMut, marginTop: 1 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  curve: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 68,
  },
  curveCol: { flex: 1, alignItems: 'center', gap: 3 },
  curveCount: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut, height: 12 },
  curveBar: {
    width: '62%',
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  curveAxis: { fontSize: 10, fontFamily: fonts.ui, color: colors.textDim },

  colorBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11, fontFamily: fonts.ui, color: colors.textMut },
});
