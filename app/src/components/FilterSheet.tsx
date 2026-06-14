// Modal de filtros completos. Cada seccion con muchas opciones tiene su
// propio input de busqueda que filtra los chips en tiempo real.

import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, OPTCG_COLORS, colorOf, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from './Icon';
import { ColorDot } from './ColorDot';
import { useT, t as translate } from '../lib/i18n';
import {
  FilterState,
  FilterOptions,
  emptyFilters,
  activeCount,
  deriveOptions,
} from '../lib/filters';
import { CARD_LIST } from '../data/loadIndex';

type Props = {
  visible: boolean;
  filters: FilterState;
  onChange: (next: FilterState | ((prev: FilterState) => FilterState)) => void;
  onClose: () => void;
};

// Cachea las opciones derivadas (no cambian en runtime).
let cachedOpts: FilterOptions | null = null;
function getOpts(): FilterOptions {
  if (!cachedOpts) cachedOpts = deriveOptions(CARD_LIST);
  return cachedOpts;
}

// Umbral para mostrar el buscador en una seccion.
const SEARCH_THRESHOLD = 12;

export function FilterSheet({ visible, filters, onChange, onClose }: Props) {
  const t = useT();
  const opts = useMemo(getOpts, []);
  const count = activeCount(filters);

  const makeToggle = useCallback(
    (field: keyof FilterState) => (val: string) => {
      onChange((prev: FilterState) => {
        const next: FilterState = { ...prev };
        const s = new Set(prev[field] as Set<string>);
        if (s.has(val)) s.delete(val);
        else s.add(val);
        (next as any)[field] = s;
        return next;
      });
    },
    [onChange]
  );

  const toggleColors     = useMemo(() => makeToggle('colors'),     [makeToggle]);
  const toggleTypes      = useMemo(() => makeToggle('types'),      [makeToggle]);
  const toggleCosts      = useMemo(() => makeToggle('costs'),      [makeToggle]);
  const togglePowers     = useMemo(() => makeToggle('powers'),     [makeToggle]);
  const toggleCounters   = useMemo(() => makeToggle('counters'),   [makeToggle]);
  const toggleAttributes = useMemo(() => makeToggle('attributes'), [makeToggle]);
  const toggleRarities   = useMemo(() => makeToggle('rarities'),   [makeToggle]);
  const toggleSets       = useMemo(() => makeToggle('sets'),       [makeToggle]);
  const toggleFamilies   = useMemo(() => makeToggle('families'),   [makeToggle]);
  const toggleVariants   = useMemo(() => makeToggle('variants'),   [makeToggle]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>{t('filter.title')} {count > 0 ? `(${count})` : ''}</Text>
          <Pressable
            onPress={() => onChange(emptyFilters())}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('filter.clearAll')}
            style={({ pressed }) => [s.clearBtn, pressed && pressedStyle]}
          >
            <Text style={s.clearText}>{t('filter.clearAll')}</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            style={({ pressed }) => [s.closeBtn, pressed && pressedStyle]}
          >
            <Icon name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <ChipSection
            title={t('filter.color')}
            options={Object.keys(OPTCG_COLORS)}
            selected={filters.colors}
            onToggle={toggleColors}
            colorOf={(k) => colorOf(k)}
            renderLeading={(k) => <ColorDot colors={[k]} size={7} />}
          />

          <ChipSection
            title={t('filter.cardType')}
            options={opts.types}
            selected={filters.types}
            onToggle={toggleTypes}
          />

          <ChipSection
            title={t('filter.cost')}
            options={opts.costs.map(String)}
            selected={filters.costs}
            onToggle={toggleCosts}
          />

          <ChipSection
            title={t('filter.power')}
            options={opts.powers.map(String)}
            renderLabel={(v) => (v === '0' ? '0' : `${Number(v) / 1000}k`)}
            selected={filters.powers}
            onToggle={togglePowers}
          />

          <ChipSection
            title={t('filter.counter')}
            options={opts.counters.map(String)}
            renderLabel={(v) => (v === '0' ? translate('filter.counterNone') : v)}
            selected={filters.counters}
            onToggle={toggleCounters}
          />

          <ChipSection
            title={t('filter.attribute')}
            options={opts.attributes}
            selected={filters.attributes}
            onToggle={toggleAttributes}
          />

          <ChipSection
            title={t('filter.rarity')}
            options={opts.rarities}
            selected={filters.rarities}
            onToggle={toggleRarities}
          />

          {opts.variants.length > 0 && (
            <ChipSection
              title={t('filter.variant')}
              options={opts.variants}
              selected={filters.variants}
              onToggle={toggleVariants}
            />
          )}

          <ChipSection
            title={t('filter.set')}
            options={opts.sets}
            selected={filters.sets}
            onToggle={toggleSets}
            searchable
            renderLabel={(code) =>
              opts.setNames[code] ? `${code} · ${opts.setNames[code]}` : code
            }
          />

          {opts.families.length > 0 && (
            <ChipSection
              title={t('filter.family')}
              options={opts.families}
              selected={filters.families}
              onToggle={toggleFamilies}
              searchable
            />
          )}
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('filter.apply')}
            style={({ pressed }) => [s.applyBtn, pressed && pressedStyle]}
          >
            <Text style={s.applyText}>{t('filter.apply')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Seccion con chips + busqueda opcional ──────────────────────────
type SectionProps = {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (val: string) => void;
  /** Si true, muestra siempre el input de busqueda (o cuando hay >12 opciones). */
  searchable?: boolean;
  /** Etiqueta visible distinta del valor. Por defecto = value. */
  renderLabel?: (v: string) => string;
  /** Color tinte por opcion (para chips de color). */
  colorOf?: (v: string) => string;
  /** Contenido extra a la izquierda del chip (ColorDot p.ej.). */
  renderLeading?: (v: string) => React.ReactNode;
};

const ChipSection = React.memo(function ChipSection({
  title,
  options,
  selected,
  onToggle,
  searchable,
  renderLabel,
  colorOf,
  renderLeading,
}: SectionProps) {
  const [q, setQ] = useState('');
  const showSearch = searchable || options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const qLow = q.trim().toLowerCase();
    if (!qLow) return options;
    return options.filter((o) => {
      const lab = renderLabel ? renderLabel(o) : o;
      return o.toLowerCase().includes(qLow) || lab.toLowerCase().includes(qLow);
    });
  }, [q, options, renderLabel]);

  // Seleccionadas que no aparecen en el filtro actual, para no esconderlas.
  const orphanSelected = useMemo(() => {
    if (!q.trim()) return [];
    const inVisible = new Set(visible);
    return [...selected].filter((v) => !inVisible.has(v));
  }, [visible, selected, q]);

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        {selected.size > 0 ? (
          <Text style={s.sectionCount}>{selected.size}</Text>
        ) : null}
      </View>

      {showSearch && options.length > 0 && (
        <View style={s.searchBox}>
          <Icon name="search" size={15} color={colors.textDim} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={translate('filter.searchIn', { section: title.toLowerCase() })}
            placeholderTextColor={colors.textDim}
            style={s.searchInput}
          />
          {q ? (
            <Pressable
              onPress={() => setQ('')}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={translate('common.cancel')}
              style={({ pressed }) => pressed && pressedStyle}
            >
              <Icon name="close" size={14} color={colors.textMut} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={s.chipRow}>
        {orphanSelected.map((v) => (
          <Chip
            key={`orphan-${v}`}
            label={(renderLabel ? renderLabel(v) : v) + ' ✕'}
            active
            onPress={() => onToggle(v)}
            color={colorOf ? colorOf(v) : undefined}
          />
        ))}
        {visible.map((v) => (
          <Chip
            key={v}
            label={renderLabel ? renderLabel(v) : v}
            active={selected.has(v)}
            onPress={() => onToggle(v)}
            color={colorOf ? colorOf(v) : undefined}
            leading={renderLeading ? renderLeading(v) : undefined}
          />
        ))}
      </View>

      {q && visible.length === 0 ? (
        <Text style={s.empty}>{translate('filter.noMatches')}</Text>
      ) : null}
    </View>
  );
});

const Chip = React.memo(function Chip({
  label,
  active,
  onPress,
  color,
  leading,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
  leading?: React.ReactNode;
}) {
  const tint = color || colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        s.chip,
        {
          borderColor: active ? tint : colors.border,
          backgroundColor: active
            ? (color ? color + '22' : colors.accentDim)
            : colors.surface,
        },
        pressed && pressedStyle,
      ]}
    >
      {leading ? <View style={{ marginRight: 6 }}>{leading}</View> : null}
      <Text style={[s.chipText, { color: active ? tint : colors.textMut }]}>{label}</Text>
    </Pressable>
  );
});

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '92%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface2,
    marginTop: 8,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, fontSize: 17, fontFamily: fonts.display, color: colors.text },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  clearText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.accent },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  section: { marginBottom: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: fonts.uiBold,
    color: colors.accent,
    backgroundColor: colors.accentDim,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 34,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.ui,
    paddingVertical: 0,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
  },
  chipText: { fontSize: 12.5, fontFamily: fonts.uiSemi },
  empty: { fontSize: 12, color: colors.textDim, marginTop: 6 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  applyBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  applyText: { fontSize: 15, color: '#fff', fontFamily: fonts.uiBold },
});
