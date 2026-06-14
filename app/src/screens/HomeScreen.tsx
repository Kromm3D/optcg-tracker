// HomeScreen — tile-grid dashboard. Full-width hero + 2-col section tiles.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HomeScreenProps } from '../navigation';
import { CARD_LIST, INDEX_META } from '../data/loadIndex';
import { colors, fonts, radii, spacing, pressedSurface } from '../theme';
import { getOwnedFor, getOwnedTotals, subscribe as subOwned } from '../lib/ownedAggregate';
import { getPrice, HOLO_RARITIES } from '../lib/prices';
import { listDecks } from '../lib/decks';
import { useT } from '../lib/i18n';

// ─── Small inline SVG icons for tiles ────────────────────────────────────────

function TileIcon({ name, size = 36, color = colors.accent }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, React.ReactNode> = {
    cards: (
      <>
        <Rect x="3" y="5" width="12" height="16" rx="2" stroke={color} strokeWidth="1.8" />
        <Rect x="9" y="3" width="12" height="16" rx="2" fill={colors.surface2} stroke={color} strokeWidth="1.8" />
      </>
    ),
    binder: (
      <Path d="M5 3h12a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2ZM9 7h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
    decks: (
      <>
        <Rect x="4" y="8" width="11" height="14" rx="2" stroke={color} strokeWidth="1.8" />
        <Rect x="9" y="4" width="11" height="14" rx="2" fill={colors.surface2} stroke={color} strokeWidth="1.8" />
      </>
    ),
    scan: (
      <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    ),
    sets: (
      <Path d="M12 3 2 8.5 12 14l10-5.5L12 3ZM2 15.5 12 21l10-5.5M2 12 12 17.5 22 12" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
    wishlist: (
      <Path d="M12 20.5 4.5 13a4.5 4.5 0 0 1 6.4-6.3l1.1 1 1.1-1A4.5 4.5 0 0 1 19.5 13Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
    stats: (
      <Path d="M4 20V14M9 20V8M14 20V12M19 20V4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    ),
    settings: (
      <>
        <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" />
        <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths[name]}
    </Svg>
  );
}

// ─── Tile components ──────────────────────────────────────────────────────────

function HeroTile({ onPress, totalOwned, uniqueOwned, completion, vaultValue }: {
  onPress: () => void;
  totalOwned: number;
  uniqueOwned: number;
  completion: number;
  vaultValue: number;
}) {
  const t = useT();
  return (
    <Pressable
      style={({ pressed }) => [s.heroTile, pressed && pressedSurface]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.collection')}
    >
      <View style={s.heroIconWrap}>
        <TileIcon name="binder" size={40} color={colors.accent} />
      </View>
      <Text style={s.heroTitle}>{t('home.collection')}</Text>
      <View style={s.heroStats}>
        <View style={s.heroStat}>
          <Text style={s.heroStatVal}>{totalOwned}</Text>
          <Text style={s.heroStatLbl}>{t('home.cardsLabel')}</Text>
        </View>
        <View style={s.heroStatDiv} />
        <View style={s.heroStat}>
          <Text style={s.heroStatVal}>{uniqueOwned}</Text>
          <Text style={s.heroStatLbl}>{t('home.unique')}</Text>
        </View>
        <View style={s.heroStatDiv} />
        <View style={s.heroStat}>
          <Text style={[s.heroStatVal, { color: colors.accent }]}>{completion}%</Text>
          <Text style={s.heroStatLbl}>{t('home.ofIndex')}</Text>
        </View>
        <View style={s.heroStatDiv} />
        <View style={s.heroStat}>
          <Text style={[s.heroStatVal, { color: colors.accent }]}>~€{vaultValue.toFixed(0)}</Text>
          <Text style={s.heroStatLbl}>{t('home.vaultValue')}</Text>
        </View>
      </View>
      {/* Progress bar */}
      <View style={s.progTrack}>
        <View style={[s.progFill, { width: `${completion}%` }]} />
      </View>
    </Pressable>
  );
}

function SectionTile({ icon, label, sub, onPress, accent = false }: {
  icon: string;
  label: string;
  sub?: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.tile, accent && s.tileAccent, pressed && pressedSurface]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
    >
      <TileIcon name={icon} size={32} color={accent ? '#fff' : colors.accent} />
      <Text style={[s.tileLabel, accent && { color: '#fff' }]}>{label}</Text>
      {sub ? <Text style={[s.tileSub, accent && { color: 'rgba(255,255,255,0.85)' }]}>{sub}</Text> : null}
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function HomeScreen({ navigation }: HomeScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);
  const [deckCount, setDeckCount] = useState(0);

  useEffect(() => {
    listDecks().then((d) => setDeckCount(d.length));
    return subOwned(() => setTick((n) => n + 1));
  }, []);

  // Recalculate every time the collection changes (tick increments).
  const stats = useMemo(() => {
    const totals = getOwnedTotals();
    const uniqueOwned = Object.values(totals).filter((n) => n > 0).length;
    const totalOwned = Object.values(totals).reduce((a, b) => a + b, 0);
    const completion = CARD_LIST.length > 0
      ? Math.round((uniqueOwned / CARD_LIST.length) * 100)
      : 0;

    let vaultValue = 0;
    for (const card of CARD_LIST) {
      const count = getOwnedFor(card.code);
      if (count) vaultValue += count * getPrice(card);
    }

    const byColor: Record<string, number> = {};
    for (const card of CARD_LIST) {
      const primary = card.colors?.[0];
      if (!primary) continue;
      byColor[primary] = (byColor[primary] ?? 0) + getOwnedFor(card.code);
    }

    return { uniqueOwned, totalOwned, completion, vaultValue, byColor };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Count unique sets
  const setCount = useMemo(() => {
    const s = new Set<string>();
    for (const c of CARD_LIST) {
      const p = c.code.split('-')[0];
      if (p) s.add(p);
    }
    return s.size;
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero tile */}
      <HeroTile
        onPress={() => navigation.navigate('Binder')}
        totalOwned={stats.totalOwned}
        uniqueOwned={stats.uniqueOwned}
        completion={stats.completion}
        vaultValue={stats.vaultValue}
      />

      {/* Main section tiles */}
      <View style={s.grid}>
        <SectionTile
          icon="cards"
          label={t('home.cards')}
          sub={`${INDEX_META.cardCount} ${t('home.inIndex')}`}
          onPress={() => navigation.navigate('Browse')}
        />
        <SectionTile
          icon="decks"
          label={t('home.decks')}
          sub={deckCount > 0 ? `${deckCount} ${deckCount > 1 ? t('home.decksPlural') : t('home.deck')}` : t('home.createDeck')}
          onPress={() => navigation.navigate('Decks')}
          accent
        />
        <SectionTile
          icon="scan"
          label={t('home.scan')}
          sub={t('home.addCards')}
          onPress={() => navigation.navigate('Scan')}
        />
        <SectionTile
          icon="sets"
          label={t('home.sets')}
          sub={`${setCount} ${t('home.setsCount')}`}
          onPress={() => navigation.navigate('Sets')}
        />
        <SectionTile
          icon="wishlist"
          label={t('home.wishlist')}
          onPress={() => navigation.navigate('Binder', { tab: 'wishlist' })}
        />
        <SectionTile
          icon="settings"
          label={t('home.settings')}
          onPress={() => navigation.navigate('Settings')}
        />
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: 110,
    gap: spacing.md,
  },

  // Hero tile
  heroTile: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    padding: 22,
    gap: 14,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.4,
    marginTop: -4,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatVal: {
    fontSize: 20,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.5,
  },
  heroStatLbl: {
    fontSize: 10,
    fontFamily: fonts.ui,
    color: colors.textMut,
  },
  heroStatDiv: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  progTrack: {
    height: 4,
    borderRadius: 99,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: colors.accent,
  },

  // Section tile grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 18,
    gap: 10,
    minHeight: 110,
    justifyContent: 'flex-end',
  },
  tileAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tileLabel: {
    fontSize: 16,
    fontFamily: fonts.uiBold,
    color: colors.text,
  },
  tileSub: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: -4,
  },
});
