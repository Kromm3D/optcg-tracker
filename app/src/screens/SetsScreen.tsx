// Colección — "Invocación espectral". Macro-tabs (MAIN/PROMO/SPECIAL/DECK) y,
// dentro de cada una, tarjetas de familia con una rejilla de "orbes fantasma":
// cada set es un anillo de progreso en cian que se RELLENA con tu colección y,
// al 100%, se MATERIALIZA (orbe sólido con el fantasma dentro).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
type SetsScreenProps = NativeStackScreenProps<RootStackParamList, 'Sets'>;
import { colors, fonts, radii, spacing } from '../theme';
import { Icon } from '../components/Icon';
import { Touchable } from '../components/Touchable';
import { ProgressRing } from '../components/ProgressRing';
import { EV_BADGE_LABELS } from '../components/SetBadge';
import { listSetCodes, summarizeSet, type SetSummary } from '../lib/setsStats';
import { setNameFor } from '../lib/setMeta';
import { subscribe as subOwned } from '../lib/ownedAggregate';
import { subscribe as subSettings } from '../lib/settings';
import { useT } from '../lib/i18n';
import type { TKey } from '../i18n/en';

// ─── Taxonomía: set → (tab, familia) ─────────────────────────────────────────

type TabKey = 'main' | 'promo' | 'special' | 'deck';

type FamilyKey =
  | 'op' | 'eb' | 'prb'        // main
  | 'promo'                     // promo
  | 'events' | 'other'         // special
  | 'st';                       // deck

const TAB_ORDER: TabKey[] = ['main', 'promo', 'special', 'deck'];
const TAB_LABEL: Record<TabKey, TKey> = {
  main: 'sets.tabMain',
  promo: 'sets.tabPromo',
  special: 'sets.tabSpecial',
  deck: 'sets.tabDeck',
};

// Familias en orden de aparición dentro de cada tab.
const FAMILIES_BY_TAB: Record<TabKey, FamilyKey[]> = {
  main: ['op', 'eb', 'prb'],
  promo: ['promo'],
  special: ['events', 'other'],
  deck: ['st'],
};

const FAMILY_TAB: Record<FamilyKey, TabKey> = {
  op: 'main', eb: 'main', prb: 'main',
  promo: 'promo',
  events: 'special', other: 'special',
  st: 'deck',
};

const FAMILY_LABEL: Record<FamilyKey, TKey> = {
  op: 'sets.famOnePiece',
  eb: 'sets.famExtra',
  prb: 'sets.famPremium',
  promo: 'sets.famPromos',
  events: 'sets.famEvents',
  other: 'sets.famOther',
  st: 'sets.famStarter',
};

function familyOf(code: string): FamilyKey {
  if (/^OP\d/.test(code)) return 'op';
  if (/^EB\d/.test(code)) return 'eb';
  if (/^PRB\d/.test(code)) return 'prb';
  if (/^ST\d/.test(code)) return 'st';
  if (code === 'P') return 'promo';
  if (code.startsWith('__ev_')) return 'events';
  return 'other';
}

/** Texto corto centrado en el orbe (abreviatura para los buckets de evento). */
function orbCode(code: string): string {
  return EV_BADGE_LABELS[code] ?? code;
}

// ─── Orbe fantasma: anillo de progreso de un set, con 3 estados ──────────────

function SetOrb({ summary, onPress }: { summary: SetSummary; onPress: () => void }) {
  const { code, pct } = summary;
  const size = 48;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const complete = clamped >= 100;
  const empty = clamped <= 0;
  const offset = c * (1 - clamped / 100);
  const center = size / 2;
  const label = orbCode(code);

  return (
    <Touchable
      style={s.orb}
      onPress={onPress}
      hitSlopOn={false}
      accessibilityRole="button"
      accessibilityLabel={`${setNameFor(code)}, ${clamped}%`}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {complete ? (
            <Circle cx={center} cy={center} r={r + 1} fill={colors.ghost} />
          ) : (
            <>
              <Circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={colors.surface2}
                strokeWidth={stroke}
                strokeDasharray={empty ? '3 4' : undefined}
              />
              {!empty && (
                <Circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={colors.ghost}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${center} ${center})`}
                />
              )}
            </>
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFill, s.orbCenter]}>
          {complete ? (
            <Icon name="ghost" size={20} color={colors.onGhost} stroke={1.8} />
          ) : (
            <Text style={[s.orbCode, empty && { color: colors.textDim }]} numberOfLines={1}>
              {label}
            </Text>
          )}
        </View>
      </View>
      <Text style={[s.orbLabel, complete && { color: colors.ghost }]} numberOfLines={1}>
        {complete ? label : `${clamped}%`}
      </Text>
    </Touchable>
  );
}

// ─── Tarjeta de familia: anillo agregado + rejilla de orbes ──────────────────

function FamilyCard({ famKey, sets, t, onOpen }: {
  famKey: FamilyKey;
  sets: SetSummary[];
  t: ReturnType<typeof useT>;
  onOpen: (code: string) => void;
}) {
  const totalCards = sets.reduce((a, s) => a + s.total, 0);
  const ownedCards = sets.reduce((a, s) => a + s.owned, 0);
  const pct = totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 0;
  const materialized = sets.filter((s) => s.total > 0 && s.pct >= 100).length;

  return (
    <View style={s.fam}>
      {/* Fantasma tenue como textura de fondo */}
      <View style={s.ghostBg} pointerEvents="none">
        <Icon name="ghost" size={104} color={colors.ghost} stroke={1.4} />
      </View>

      <View style={s.famHead}>
        <ProgressRing pct={pct} size={64} stroke={5} />
        <View style={{ flex: 1 }}>
          <Text style={s.famTitle}>{t(FAMILY_LABEL[famKey])}</Text>
          <Text style={s.famSub}>
            {ownedCards} / {totalCards} · {sets.length} {t('sets.setsWord')}
          </Text>
          <View style={s.spookRow}>
            <Icon name="ghost" size={12} color={colors.ghost} stroke={1.8} />
            <Text style={s.spook}>{t('sets.materialized', { n: materialized })}</Text>
          </View>
        </View>
      </View>

      <View style={s.grid}>
        {sets.map((sum) => (
          <SetOrb key={sum.code} summary={sum} onPress={() => onOpen(sum.code)} />
        ))}
      </View>
    </View>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export function SetsScreen({ navigation }: SetsScreenProps) {
  const t = useT();
  const [, force] = useState(0);
  const [tab, setTab] = useState<TabKey>('main');

  useEffect(() => {
    const u1 = subOwned(() => force((n) => n + 1));
    const u2 = subSettings(() => force((n) => n + 1));
    return () => { u1(); u2(); };
  }, []);

  const setCodes = useMemo(() => listSetCodes(), []);
  const live = setCodes.map((code) => summarizeSet(code));

  // Progreso global (todas las familias).
  const global = useMemo(() => {
    let owned = 0, total = 0;
    for (const sm of live) { owned += sm.owned; total += sm.total; }
    return { owned, total, pct: total > 0 ? Math.round((owned / total) * 100) : 0 };
  }, [live]);

  // Agrupa los sets de la tab activa por familia, respetando el orden.
  const families = useMemo(() => {
    const byFam = new Map<FamilyKey, SetSummary[]>();
    for (const sm of live) {
      const fk = familyOf(sm.code);
      if (FAMILY_TAB[fk] !== tab) continue;
      const arr = byFam.get(fk);
      if (arr) arr.push(sm); else byFam.set(fk, [sm]);
    }
    return FAMILIES_BY_TAB[tab]
      .filter((fk) => byFam.has(fk))
      .map((fk) => ({ fk, sets: byFam.get(fk)! }));
  }, [live, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Cabecera global: barra de progreso + % en cian */}
      <View style={s.globalRow}>
        <View style={{ flex: 1 }}>
          <View style={s.globalTrack}>
            <View style={[s.globalFill, { width: `${global.pct}%` }]} />
          </View>
          <Text style={s.globalSub}>
            {global.owned} / {global.total} {t('sets.cardsLabel')}
          </Text>
        </View>
        <Text style={s.globalPct}>{global.pct}%</Text>
      </View>

      {/* Macro-tabs */}
      <View style={s.tabs}>
        {TAB_ORDER.map((key) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={s.tab}
            >
              <Text style={[s.tabLabel, active && s.tabLabelOn]}>{t(TAB_LABEL[key])}</Text>
              <View style={[s.tabUnderline, active && s.tabUnderlineOn]} />
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {families.map(({ fk, sets }) => (
          <FamilyCard
            key={fk}
            famKey={fk}
            sets={sets}
            t={t}
            onOpen={(code) => navigation.navigate('SetDetail', { setCode: code })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // Cabecera global
  globalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 14,
  },
  globalTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  globalFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: colors.ghost,
  },
  globalSub: {
    fontSize: 11,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: 6,
  },
  globalPct: {
    fontSize: 20,
    fontFamily: fonts.display,
    color: colors.ghost,
    letterSpacing: -0.5,
  },

  // Macro-tabs
  tabs: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { paddingTop: 2 },
  tabLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
    letterSpacing: 0.4,
    paddingBottom: 9,
  },
  tabLabelOn: { color: colors.text },
  tabUnderline: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabUnderlineOn: { backgroundColor: colors.accent },

  scroll: {
    padding: spacing.lg,
    paddingBottom: 120,
  },

  // Tarjeta de familia
  fam: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  ghostBg: {
    position: 'absolute',
    right: -14,
    bottom: -28,
    opacity: 0.05,
  },
  famHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 14,
  },
  famTitle: {
    fontSize: 17,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.3,
  },
  famSub: {
    fontSize: 11,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: 2,
  },
  spookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  spook: {
    fontSize: 10.5,
    fontFamily: fonts.uiSemi,
    color: colors.ghost,
  },

  // Rejilla de orbes
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  orb: {
    width: '20%',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  orbCenter: { alignItems: 'center', justifyContent: 'center' },
  orbCode: {
    fontSize: 9.5,
    fontFamily: fonts.display,
    color: colors.text,
  },
  orbLabel: {
    fontSize: 9,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
  },
});
