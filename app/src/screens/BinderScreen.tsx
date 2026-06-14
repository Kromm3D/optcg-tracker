// Binder: Collection / Wishlist / Trade tabs.
// Wishlist tab mirrors DecksScreen: a list of named wishlists, tap to open detail.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BinderScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface, HIT_SLOP } from '../theme';
import { AppModal } from '../components/AppModal';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/SegmentedControl';
import { CARDS, CARD_LIST } from '../data/loadIndex';
import { CardThumb } from '../components/CardThumb';
import { ColumnsToggle } from '../components/ColumnsToggle';
import { CachedImage } from '../components/CachedImage';
import { AddCardsModal } from '../components/AddCardsModal';
import { ShareSheet } from '../components/ShareSheet';
import { FilterSheet } from '../components/FilterSheet';
import { BulkActionBar, type BulkTarget } from '../components/BulkActionBar';
import { BulkTargetSheet, type BulkSelection } from '../components/BulkTargetSheet';
import { Icon } from '../components/Icon';
import {
  FilterState,
  emptyFilters,
  activeCount,
  matches,
} from '../lib/filters';
import { sortCards, type SortKey } from '../lib/cardQuery';
import { getOwnedFor, getOwnedTotals, getVariantOwned, subscribe as subOwned, subscribeMembership as subOwnedMembership } from '../lib/ownedAggregate';
import { expandCards, normalVariant, type DisplayEntry } from '../lib/cardDisplay';
import {
  listWishlists,
  createWishlist,
  deleteWishlist,
  subscribe as subWishlists,
} from '../lib/wishlists';
import { resolveImageUris } from '../lib/images';
import { getTradeQty, getOverrides, setTradeOverride, subscribe as subTrade } from '../lib/trade';
import { adjust } from '../lib/collection';
import { getSettings, subscribe as subSettings } from '../lib/settings';
import { useT } from '../lib/i18n';
import { useCardGrid } from '../lib/useCardGrid';
import type { Card, Variant, Wishlist } from '../types';

type Tab = 'owned' | 'wishlist' | 'trade';
// Binder expone un subconjunto de las claves de orden compartidas.
type BinderSortKey = Extract<SortKey, 'code' | 'set' | 'power' | 'rarity'>;
type SortState = { key: BinderSortKey; dir: 'asc' | 'desc' };

/** Small cover-art thumbnail for the wishlist row (first card's image, or icon). */
function WishlistThumb({ wl }: { wl: Wishlist }) {
  const firstEntry = Object.values(wl.cards)[0];
  const card = firstEntry ? CARDS[firstEntry.code] : null;
  const v = card?.variants.find((vv) => vv.suffix === firstEntry?.suffix) ?? card?.variants[0];
  if (!v) {
    return (
      <View style={ws.wlIcon}>
        <Icon name="heart" size={20} color={colors.accent} />
      </View>
    );
  }
  const { uri, fallback } = resolveImageUris(v);
  return (
    <View style={ws.wlThumb}>
      <CachedImage uri={uri} fallbackUri={fallback} style={ws.wlThumbImg} />
    </View>
  );
}

/** Trade qty en vivo, suscrito a trade.ts con bail-out (solo re-renderiza la
 *  celda cuya cantidad cambia). `code === null` desactiva la suscripción. */
function useTradeQty(code: string | null): number {
  const [n, setN] = useState(() => (code ? getTradeQty(code) : 0));
  useEffect(() => {
    if (!code) return;
    const update = () => setN((prev) => { const v = getTradeQty(code); return prev === v ? prev : v; });
    update();
    return subTrade(update);
  }, [code]);
  return n;
}

type GridCardProps = {
  card: Card;
  variant: Variant;
  itemKey: string;
  tab: Tab;
  showAlt: boolean;
  showAll: boolean;
  compact: boolean;
  cardWidth: number;
  selectMode: boolean;
  selected: boolean;
  onPress: (card: Card, variant: Variant, key: string) => void;
  onLongPress: (card: Card, variant: Variant, key: string) => void;
  onAdjust: (card: Card, variant: Variant, delta: number) => void;
};

// Celda del grid, memoizada. La cantidad se deriva en vivo dentro de CardThumb
// (modo live, tab owned) o vía useTradeQty (tab trade), de modo que editar una
// copia re-renderiza únicamente esta celda — no toda la lista.
const GridCard = React.memo(function GridCard({
  card, variant, itemKey, tab, showAlt, showAll, compact, cardWidth,
  selectMode, selected, onPress, onLongPress, onAdjust,
}: GridCardProps) {
  const tradeQty = useTradeQty(tab === 'trade' ? card.code : null);
  const common = {
    card,
    variant,
    compact,
    selected: selectMode && selected,
    onAdjust: selectMode ? undefined : (delta: number) => onAdjust(card, variant, delta),
    onLongPress: () => onLongPress(card, variant, itemKey),
    onPress: () => onPress(card, variant, itemKey),
    width: cardWidth,
  };
  if (tab === 'trade') {
    return <CardThumb {...common} owned={tradeQty} qty={tradeQty} />;
  }
  return (
    <CardThumb
      {...common}
      liveCode={card.code}
      livePerVariant={showAlt}
      liveMultiArt={!showAlt}
      dimWhenEmpty={showAll}
    />
  );
});

export function BinderScreen({ navigation, route }: BinderScreenProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'owned');

  // Honor a `tab` param pushed after mount (e.g. Home "Wishlist" tile).
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);
  // `tick` solo cambia cuando cambia la *pertenencia* (qué cartas posees) o
  // filtros/orden — recomputa la lista. `countTick` cambia con cada +/- para
  // refrescar solo el contador de la cabecera (las celdas se actualizan solas).
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  const [, setCountTick] = useState(0);
  const bumpCount = useCallback(() => setCountTick((n) => n + 1), []);

  // Wishlists (for the wishlist tab list)
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [showCreateWL, setShowCreateWL] = useState(false);
  const [newWLName, setNewWLName] = useState('');
  const [wlToDelete, setWlToDelete] = useState<Wishlist | null>(null);

  const [columns, setColumnsState] = useState(getSettings().columns);
  const { cardWidth, gap, hPadding } = useCardGrid(columns);

  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'code', dir: 'asc' });

  const [showAll, setShowAll] = useState(false);

  // Multi-select / bulk actions (Owned + Trade tabs)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, BulkSelection>>({});
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);
  const selectedList = Object.values(selected);

  const toggleSel = useCallback((key: string, code: string, suffix: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { code, suffix };
      return next;
    }), []);
  const clearSel = () => { setSelected({}); setSelectMode(false); };

  const refreshWishlists = useCallback(() => {
    listWishlists().then(setWishlists);
  }, []);

  useEffect(() => {
    refreshWishlists();
    // Pertenencia (alta/baja de carta) → recomputa lista. Cantidad → solo cabecera.
    const unsubMem = subOwnedMembership(bump);
    const unsubCnt = subOwned(bumpCount);
    const unsubW = subWishlists(() => { refreshWishlists(); bump(); });
    const unsubS = subSettings(() => { setColumnsState(getSettings().columns); bump(); });
    const unsubT = subTrade(() => { bump(); bumpCount(); });
    return () => { unsubMem(); unsubCnt(); unsubW(); unsubS(); unsubT(); };
  }, [refreshWishlists, bump, bumpCount]);

  // Clear multi-select when switching tabs
  const handleTabChange = useCallback((newTab: Tab) => {
    clearSel();
    setTab(newTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle sort key or flip direction if already active
  const handleSort = useCallback((key: BinderSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  }, []);

  // Handlers estables para las celdas (evitan re-render de todo el grid).
  const handlePressCard = useCallback((card: Card, variant: Variant, key: string) => {
    if (selectMode) toggleSel(key, card.code, variant?.suffix ?? '');
    else navigation.navigate('Detail', { code: card.code });
  }, [selectMode, navigation, toggleSel]);

  const handleLongPressCard = useCallback((card: Card, variant: Variant, key: string) => {
    if (!selectMode) setSelectMode(true);
    toggleSel(key, card.code, variant?.suffix ?? '');
  }, [selectMode, toggleSel]);

  const handleAdjustCard = useCallback((card: Card, variant: Variant, delta: number) => {
    if (tab === 'trade') setTradeOverride(card.code, Math.max(0, getTradeQty(card.code) + delta));
    else adjust(card.code, variant?.suffix ?? '', delta);
  }, [tab]);

  // Cards for Collection and Trade tabs.
  // En lugar de barrer las ~4571 cartas del índice, partimos del conjunto
  // pequeño de códigos relevantes (poseídos / en trade) salvo en "Show all".
  const ownedTradeCards = useMemo<Card[]>(() => {
    let base: Card[];
    if (tab === 'trade') {
      // Candidatos = poseídos (overflow de playset) ∪ overrides manuales.
      const codes = new Set([...Object.keys(getOwnedTotals()), ...Object.keys(getOverrides())]);
      base = [];
      for (const code of codes) {
        const card = CARDS[code];
        if (card && getTradeQty(code) > 0) base.push(card);
      }
    } else if (showAll) {
      base = CARD_LIST;
    } else {
      base = [];
      for (const code of Object.keys(getOwnedTotals())) {
        if (getOwnedFor(code) > 0) {
          const card = CARDS[code];
          if (card) base.push(card);
        }
      }
    }
    return sortCards(base.filter((c) => matches(c, filters)), sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, showAll, filters, sort, tick]);

  // Display tiles for the grid. Owned tab expands per-variant when Show
  // Alternate Art is on; Trade stays base-code (one tile per card).
  const showAlt = getSettings().showAlternateArt;
  const gridData = useMemo<DisplayEntry[]>(() => {
    if (tab === 'trade') {
      return ownedTradeCards.map((c) => ({ card: c, variant: normalVariant(c) as any, key: c.code }));
    }
    let es = expandCards(ownedTradeCards);
    if (!showAll) {
      es = es.filter((e) =>
        showAlt ? getVariantOwned(e.card.code, e.variant.suffix) > 0 : getOwnedFor(e.card.code) > 0,
      );
    }
    return es;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ownedTradeCards, showAlt, showAll, tick]);

  // extraData estable: solo cambia al entrar/salir de selección, no al editar
  // copias → en el flujo normal de +/- la FlatList no re-renderiza las celdas.
  const extraData = useMemo(() => ({ selectMode, selected }), [selectMode, selected]);
  const compact = columns >= 3;
  const renderItem = useCallback(({ item }: { item: DisplayEntry }) => (
    <GridCard
      card={item.card}
      variant={item.variant}
      itemKey={item.key}
      tab={tab}
      showAlt={showAlt}
      showAll={showAll}
      compact={compact}
      cardWidth={cardWidth}
      selectMode={selectMode}
      selected={!!selected[item.key]}
      onPress={handlePressCard}
      onLongPress={handleLongPressCard}
      onAdjust={handleAdjustCard}
    />
  ), [tab, showAlt, showAll, compact, cardWidth, selectMode, selected, handlePressCard, handleLongPressCard, handleAdjustCard]);

  const handleCreateWL = useCallback(async () => {
    if (!newWLName.trim()) return;
    const wl = await createWishlist(newWLName.trim());
    setShowCreateWL(false);
    setNewWLName('');
    (navigation as any).navigate('WishlistDetail', { wishlistId: wl.id });
  }, [newWLName, navigation]);

  const confirmDeleteWL = useCallback(() => {
    if (wlToDelete) deleteWishlist(wlToDelete.id);
    setWlToDelete(null);
  }, [wlToDelete]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const SortRow = () => (
    <View style={s.sortRow}>
      {(
        [
          ['code', t('sort.code')],
          ['set', t('sort.set')],
          ['power', t('sort.power')],
          ['rarity', t('sort.rarity')],
        ] as [BinderSortKey, string][]
      ).map(([k, label]) => {
        const active = sort.key === k;
        return (
          <Pressable
            key={k}
            onPress={() => handleSort(k)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [s.sortBtn, active && s.sortBtnOn, pressed && pressedStyle]}
          >
            <Text style={[s.sortLabel, { color: active ? colors.accent : colors.textMut }]}>
              {label}
            </Text>
            {active && (
              <Icon
                name={sort.dir === 'asc' ? 'arrowUp' : 'arrowDn'}
                size={11}
                color={colors.accent}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Top tab bar */}
      <View style={s.tabBarWrap}>
        <SegmentedControl<Tab>
          segments={[
            { key: 'owned', label: t('binder.collection') },
            { key: 'wishlist', label: t('binder.wishlist') },
            { key: 'trade', label: t('binder.trade') },
          ]}
          value={tab}
          onChange={handleTabChange}
        />
      </View>

      {/* ── Wishlist tab: Decks-style list ───────────────────────────────────── */}
      {tab === 'wishlist' && (
        <>
          {wishlists.length === 0 ? (
            <View style={s.empty}>
              <Icon name="heart" size={48} color={colors.textDim} />
              <Text style={s.emptyTitle}>{t('binder.emptyWishlist')}</Text>
              <Text style={s.emptyBody}>{t('binder.emptyWishlistBody')}</Text>
              <Pressable
                style={({ pressed }) => [s.createBtn, pressed && pressedStyle]}
                onPress={() => setShowCreateWL(true)}
                accessibilityRole="button"
                accessibilityLabel={t('wl.newWishlist')}
              >
                <Icon name="plus" size={18} color="#fff" />
                <Text style={s.createBtnText}>{t('wl.newWishlist')}</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={wishlists}
              keyExtractor={(w) => w.id}
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <Pressable
                  style={({ pressed }) => [s.newRow, pressed && pressedStyle]}
                  onPress={() => setShowCreateWL(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('wl.newWishlist')}
                >
                  <Icon name="plus" size={18} color={colors.accent} />
                  <Text style={s.newRowText}>{t('wl.newWishlist')}</Text>
                </Pressable>
              }
              renderItem={({ item }) => {
                const totalNeeded = Object.values(item.cards).reduce((a, wc) => a + wc.needed, 0);
                const totalOwned = Object.values(item.cards).reduce(
                  (a, wc) => a + Math.min(getOwnedFor(wc.code), wc.needed),
                  0,
                );
                const cardCount = Object.keys(item.cards).length;
                return (
                  <Pressable
                    style={({ pressed }) => [s.wlRow, pressed && pressedSurface]}
                    onPress={() => (navigation as any).navigate('WishlistDetail', { wishlistId: item.id })}
                    onLongPress={() => setWlToDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                  >
                    <WishlistThumb wl={item} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.wlName}>{item.name}</Text>
                      <Text style={s.wlMeta}>
                        {cardCount} {t('wl.entries')} · {totalOwned}/{totalNeeded} {t('wl.copiesNeeded')}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setWlToDelete(item)}
                      hitSlop={HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel={t('wl.delete')}
                      style={({ pressed }) => [s.rowMenuBtn, pressed && pressedStyle]}
                    >
                      <Icon name="dots" size={20} color={colors.textMut} />
                    </Pressable>
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            />
          )}

          {/* Create wishlist modal */}
          <AppModal visible={showCreateWL} onClose={() => setShowCreateWL(false)} title={t('wl.createWishlist')}>
            <TextInput
              style={s.modalInput}
              value={newWLName}
              onChangeText={setNewWLName}
              placeholder={t('wl.namePlaceholder')}
              placeholderTextColor={colors.textDim}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateWL}
            />
            <View style={s.modalRow}>
              <Button title={t('common.cancel')} variant="secondary" onPress={() => setShowCreateWL(false)} style={s.modalBtn} />
              <Button title={t('wl.create')} onPress={handleCreateWL} disabled={!newWLName.trim()} style={s.modalBtn} />
            </View>
          </AppModal>

          {/* Delete wishlist confirmation (themed) */}
          <AppModal visible={wlToDelete !== null} onClose={() => setWlToDelete(null)} title={t('wl.delete')}>
            <Text style={s.confirmBody}>{t('wl.deleteConfirm', { name: wlToDelete?.name ?? '' })}</Text>
            <View style={s.modalRow}>
              <Button title={t('common.cancel')} variant="secondary" onPress={() => setWlToDelete(null)} style={s.modalBtn} />
              <Button title={t('common.delete')} variant="danger" onPress={confirmDeleteWL} style={s.modalBtn} />
            </View>
          </AppModal>
        </>
      )}

      {/* ── Collection / Trade tab ────────────────────────────────────────────── */}
      {tab !== 'wishlist' && (
        <>
          {/* Meta / action row */}
          <View style={s.metaRow}>
            <Text style={s.meta}>
              {tab === 'trade'
                ? `${ownedTradeCards.length} ${t('binder.uniqueCards')} · ${ownedTradeCards.reduce((a, c) => a + getTradeQty(c.code), 0)} ${t('binder.copies')}`
                : `${ownedTradeCards.length} ${t('binder.uniqueCards')} · ${ownedTradeCards.reduce((a, c) => a + getOwnedFor(c.code), 0)} ${t('binder.units')}`
              }
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {tab === 'owned' && (
                <Pressable
                  style={({ pressed }) => [s.showAllBtn, showAll && s.showAllBtnOn, pressed && pressedStyle]}
                  onPress={() => setShowAll((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showAll ? t('binder.ownedOnly') : t('binder.showAll')}
                  accessibilityState={{ selected: showAll }}
                >
                  <Text style={[s.showAllText, showAll && s.showAllTextOn]}>
                    {showAll ? t('binder.ownedOnly') : t('binder.showAll')}
                  </Text>
                </Pressable>
              )}
              {tab === 'trade' && ownedTradeCards.length > 0 && (
                <Pressable
                  style={({ pressed }) => [s.iconBtn, pressed && pressedStyle]}
                  onPress={() => setShowShare(true)}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={t('binder.shareImage')}
                >
                  <Icon name="external" size={15} color={colors.textMut} />
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [s.iconBtn, activeCount(filters) > 0 && s.iconBtnOn, pressed && pressedStyle]}
                onPress={() => setShowFilters(true)}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('filter.title')}
              >
                <Icon name="filter" size={15} color={activeCount(filters) > 0 ? colors.accent : colors.textMut} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.iconBtn, selectMode && s.iconBtnOn, pressed && pressedStyle]}
                onPress={() => { if (selectMode) clearSel(); else setSelectMode(true); }}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('bulk.select')}
                accessibilityState={{ selected: selectMode }}
              >
                <Icon name={selectMode ? 'close' : 'check'} size={15} color={selectMode ? colors.accent : colors.textMut} />
              </Pressable>
              <ColumnsToggle />
              {tab === 'owned' && (
                <Pressable
                  style={({ pressed }) => [s.addBtn, pressed && pressedStyle]}
                  onPress={() => setShowAdd(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('wl.addCards')}
                >
                  <Icon name="plus" size={18} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>

          <SortRow />

          {ownedTradeCards.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>
                {tab === 'owned' ? t('binder.emptyOwned') : t('binder.emptyTrade')}
              </Text>
              <Text style={s.emptyBody}>
                {tab === 'owned' ? t('binder.emptyOwnedBody') : t('binder.emptyTradeBody')}
              </Text>
            </View>
          ) : (
            <FlatList
              key={`grid-${columns}-${tab}`}
              data={gridData}
              keyExtractor={(e) => e.key}
              numColumns={columns}
              extraData={extraData}
              columnWrapperStyle={{ gap, paddingHorizontal: hPadding }}
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: selectMode ? 180 : 110, gap: gap + 4 }}
              renderItem={renderItem}
              initialNumToRender={15}
              maxToRenderPerBatch={12}
              windowSize={5}
              removeClippedSubviews
            />
          )}
        </>
      )}

      {/* Bulk select bar + sheet (Owned + Trade tabs) */}
      {tab !== 'wishlist' && selectMode && (
        <BulkActionBar count={selectedList.length} onClear={clearSel} onPick={setBulkTarget} bottomGap={84} />
      )}

      <BulkTargetSheet
        visible={bulkTarget !== null}
        target={bulkTarget}
        selections={selectedList}
        onClose={() => setBulkTarget(null)}
        onDone={() => { setBulkTarget(null); clearSel(); }}
      />

      {/* Modals for Collection tab */}
      <AddCardsModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        search={addSearch}
        onSearchChange={setAddSearch}
        getQty={(code) => getOwnedFor(code)}
        onChange={(code, delta) => {
          const suffix = CARDS[code]?.variants[0]?.suffix ?? '';
          adjust(code, suffix, delta);
        }}
      />

      <ShareSheet
        visible={showShare}
        onClose={() => setShowShare(false)}
        title={t('binder.trade')}
        cards={ownedTradeCards}
        qtyFor={(code) => getTradeQty(code)}
      />

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tabBarWrap: { marginHorizontal: 18, marginTop: 4 },
  rowMenuBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Wishlist list (deck-style)
  list: { padding: spacing.lg, paddingBottom: 110, gap: spacing.sm },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: spacing.sm,
  },
  newRowText: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.accent },
  wlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wlName: { fontSize: 16, fontFamily: fonts.uiBold, color: colors.text },
  wlMeta: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: 2 },
  createBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.accent,
  },
  createBtnText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  meta: { fontSize: 12, color: colors.textMut, fontFamily: fonts.ui, flex: 1, marginRight: 8 },
  addBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  iconBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },

  // Sort row with direction arrows
  sortRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingBottom: 8 },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
  },
  sortBtnOn: { backgroundColor: colors.accentDim },
  sortLabel: { fontSize: 12, fontFamily: fonts.uiSemi },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.text, marginBottom: 4 },
  emptyBody: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center' },

  showAllBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  showAllBtnOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  showAllText: { fontSize: 11, fontFamily: fonts.uiSemi, color: colors.textMut },
  showAllTextOn: { color: colors.accent },
  modalBtn: { flex: 1 },
  confirmBody: { fontSize: 14, fontFamily: fonts.ui, color: colors.textMut, lineHeight: 21 },

  // Create WL modal
  modalBg: { flex: 1, backgroundColor: 'rgba(14,12,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.border, padding: 24, gap: 16 },
  modalTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  modalInput: { height: 50, borderRadius: radii.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, fontSize: 16, fontFamily: fonts.ui, color: colors.text },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, height: 48, borderRadius: radii.lg, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontFamily: fonts.uiSemi, color: colors.textMut },
  modalConfirm: { flex: 1, height: 48, borderRadius: radii.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { fontSize: 15, fontFamily: fonts.uiBold, color: '#fff' },
});

// Shared styles used by WishlistThumb (module-level, not inside component)
const ws = StyleSheet.create({
  wlThumb: { width: 44, height: 62, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface2 },
  wlThumbImg: { width: '100%', height: '100%' },
  wlIcon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
});
