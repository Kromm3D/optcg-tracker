// Estado de los filtros del browse + predicate que decide si una carta pasa.
// Los filtros multi-valor son sets de strings. Vacio = "no filtra".

import type { Card } from '../types';

/** Orden de visualizacion de rarezas en el FilterSheet. */
const RARITY_DISPLAY_ORDER = ['L', 'C', 'UC', 'R', 'SR', 'SEC', 'P', 'SP', 'TR'];

export type FilterState = {
  /** Colores OPTCG seleccionados (Red, Green, ...). */
  colors: Set<string>;
  /** Leader / Character / Event / Stage */
  types: Set<string>;
  /** Costes seleccionados (numeros como strings: "0", "1", ...). */
  costs: Set<string>;
  /** Power bucket: "0", "1000", "2000", ..., "13000" */
  powers: Set<string>;
  /** Counter value: "0", "1000", "2000" */
  counters: Set<string>;
  /** Attribute: Slash, Strike, Special, Wisdom, Ranged */
  attributes: Set<string>;
  /** Rareza: C, UC, R, SR, L, SEC, P, SP, TR */
  rarities: Set<string>;
  /** Set prefix (OP01, EB02, ST01, ...). */
  sets: Set<string>;
  /** Family / trait — match parcial sobre el campo family. */
  families: Set<string>;
  /** Etiquetas de variante / parallel (Normal, Parallel, Manga, ...). */
  variants: Set<string>;
};

export function emptyFilters(): FilterState {
  return {
    colors: new Set(),
    types: new Set(),
    costs: new Set(),
    powers: new Set(),
    counters: new Set(),
    attributes: new Set(),
    rarities: new Set(),
    sets: new Set(),
    families: new Set(),
    variants: new Set(),
  };
}

export function activeCount(f: FilterState): number {
  return (
    f.colors.size +
    f.types.size +
    f.costs.size +
    f.powers.size +
    f.counters.size +
    f.attributes.size +
    f.rarities.size +
    f.sets.size +
    f.families.size +
    f.variants.size
  );
}

/** Devuelve el set prefix de un codigo: "OP01-005" -> "OP01". */
export function setPrefix(code: string): string {
  const i = code.indexOf('-');
  return i > 0 ? code.slice(0, i) : code;
}

/** Bucket de power: agrupa al millar (5500 -> "5000"). */
export function powerBucket(p: number | null | undefined): string {
  if (p === null || p === undefined) return '';
  return String(Math.floor(p / 1000) * 1000);
}

/** Decide si una carta cumple TODOS los filtros activos. */
export function matches(card: Card, f: FilterState): boolean {
  // colors: si hay seleccion, al menos uno de los colores de la carta tiene que estar
  if (f.colors.size > 0) {
    const cs = card.colors ?? [];
    let ok = false;
    for (const c of cs) if (f.colors.has(c)) { ok = true; break; }
    if (!ok) return false;
  }
  if (f.types.size > 0 && (!card.type || !f.types.has(card.type))) return false;
  if (f.costs.size > 0) {
    if (card.cost === null || card.cost === undefined) return false;
    if (!f.costs.has(String(card.cost))) return false;
  }
  if (f.powers.size > 0) {
    const bucket = powerBucket(card.power);
    if (!bucket || !f.powers.has(bucket)) return false;
  }
  if (f.counters.size > 0) {
    const c = card.counter ?? 0;
    if (!f.counters.has(String(c))) return false;
  }
  if (f.attributes.size > 0) {
    if (!card.attribute) return false;
    const cardAttrs = card.attribute.split('/').map((a) => a.trim());
    if (!cardAttrs.some((a) => f.attributes.has(a))) return false;
  }
  if (f.rarities.size > 0) {
    const r = card.variants[0]?.rarity?.toUpperCase() ?? '';
    if (!f.rarities.has(r)) return false;
  }
  if (f.sets.size > 0) {
    if (!f.sets.has(setPrefix(card.code))) return false;
  }
  if (f.variants.size > 0) {
    // La carta pasa si tiene al menos una variante con la etiqueta elegida.
    let ok = false;
    for (const v of card.variants) {
      if (v.label && f.variants.has(v.label)) { ok = true; break; }
    }
    if (!ok) return false;
  }
  if (f.families.size > 0) {
    const fam = (card.family ?? '').toLowerCase();
    let ok = false;
    for (const want of f.families) {
      if (fam.includes(want.toLowerCase())) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

// Color aliases for fuzzy token search (lowercase → canonical OPTCG color key)
const COLOR_ALIASES: Record<string, string> = {
  red: 'Red', green: 'Green', blue: 'Blue',
  purple: 'Purple', black: 'Black', yellow: 'Yellow',
};

// Tokens like "op01", "op15", "eb02", "st01" → set prefix
const SET_TOKEN_RE = /^[a-z]{2,3}\d{2,3}$/i;

// Cost shorthand: "2c" or "c2" (1–2 digit number = cost value)
const COST_RE = /^(\d{1,2})c$|^c(\d{1,2})$/i;
// Counter shorthand: "1k" = 1000, "2k" = 2000
const COUNTER_K_RE = /^(\d+)k$/i;
// Counter full: "c1000", "c2000" (3+ digits after c = counter value)
const COUNTER_FULL_RE = /^c(\d{3,})$/i;

/**
 * Token-based fuzzy filter. Each space-separated token is classified:
 * - color name      → must match card.colors
 * - set code        → must match card's set prefix (e.g. "op15")
 * - "2c" / "c2"    → must match card.cost
 * - "1k" / "c1000" → must match card.counter
 * - anything else  → must appear in name/code/type/effect/trigger/family/attribute
 * All tokens must pass (AND logic). Empty query returns all cards.
 */
export function fuzzyFilter(cards: Card[], q: string): Card[] {
  const raw = q.trim().toLowerCase();
  if (!raw) return cards;

  const tokens = raw.split(/\s+/);
  const colorTokens: string[] = [];
  const setTokens: string[] = [];
  const costTokens: number[] = [];
  const counterTokens: number[] = [];
  const textTokens: string[] = [];

  for (const tok of tokens) {
    const cm = COST_RE.exec(tok);
    if (cm) { costTokens.push(parseInt(cm[1] ?? cm[2], 10)); continue; }
    const km = COUNTER_K_RE.exec(tok);
    if (km) { counterTokens.push(parseInt(km[1], 10) * 1000); continue; }
    const cfm = COUNTER_FULL_RE.exec(tok);
    if (cfm) { counterTokens.push(parseInt(cfm[1], 10)); continue; }
    if (COLOR_ALIASES[tok]) { colorTokens.push(COLOR_ALIASES[tok]); continue; }
    if (SET_TOKEN_RE.test(tok)) { setTokens.push(tok.toUpperCase()); continue; }
    textTokens.push(tok);
  }

  return cards.filter((c) => {
    if (colorTokens.length > 0) {
      const cs = c.colors ?? [];
      if (!colorTokens.some((col) => cs.includes(col))) return false;
    }
    if (setTokens.length > 0) {
      const prefix = c.code.split('-')[0].toUpperCase();
      if (!setTokens.some((s) => prefix === s)) return false;
    }
    if (costTokens.length > 0) {
      if (c.cost === null || c.cost === undefined) return false;
      if (!costTokens.some((n) => c.cost === n)) return false;
    }
    if (counterTokens.length > 0) {
      const cc = c.counter ?? 0;
      if (!counterTokens.some((n) => cc === n)) return false;
    }
    if (textTokens.length > 0) {
      const haystack = [
        c.name, c.code, c.type ?? '', c.family ?? '',
        c.attribute ?? '', c.effect ?? '', c.trigger ?? '',
      ].join(' ').toLowerCase();
      if (!textTokens.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

/** Genera la lista unica de valores presentes en el dataset, util para
 *  poblar el FilterSheet con opciones reales y no inventadas. */
export type FilterOptions = {
  types: string[];
  costs: number[];
  powers: number[];
  counters: number[];
  attributes: string[];
  rarities: string[];
  sets: string[];
  /** Nombre canonico del set por codigo (derivado de la carta con codigo mas bajo). */
  setNames: Record<string, string>;
  families: string[];
  variants: string[];
};

export function deriveOptions(cards: Card[]): FilterOptions {
  const types = new Set<string>();
  const costs = new Set<number>();
  const powers = new Set<number>();
  const counters = new Set<number>();
  const attributes = new Set<string>();
  const rarities = new Set<string>();
  const sets = new Set<string>();
  const families = new Set<string>();
  const variants = new Set<string>();

  // Para set names: carta con codigo mas bajo de cada prefijo → set_name mas fiable
  const setLowest: Record<string, string> = {};
  const setNames: Record<string, string> = {};

  for (const c of cards) {
    for (const v of c.variants) if (v.label) variants.add(v.label);
    if (c.type) types.add(c.type);
    if (c.cost !== null && c.cost !== undefined) costs.add(c.cost);
    if (c.power !== null && c.power !== undefined) {
      const b = Math.floor(c.power / 1000) * 1000;
      powers.add(b);
    }
    counters.add(c.counter ?? 0);
    // Atributos compuestos ("Strike/Ranged") → individuales
    if (c.attribute) {
      for (const attr of c.attribute.split('/')) {
        const trimmed = attr.trim();
        if (trimmed) attributes.add(trimmed);
      }
    }
    const r = c.variants[0]?.rarity?.toUpperCase() ?? '';
    if (r) rarities.add(r);
    const sp = setPrefix(c.code);
    sets.add(sp);
    if (!setLowest[sp] || c.code < setLowest[sp]) {
      setLowest[sp] = c.code;
      if (c.set_name) setNames[sp] = c.set_name;
    }
    if (c.family) {
      // family puede ser "Pirate/Whitebeard Pirates" -> split por /
      for (const f of c.family.split('/')) {
        const trimmed = f.trim();
        if (trimmed) families.add(trimmed);
      }
    }
  }

  return {
    types: [...types].sort(),
    costs: [...costs].sort((a, b) => a - b),
    powers: [...powers].sort((a, b) => a - b),
    counters: [...counters].sort((a, b) => a - b),
    attributes: [...attributes].sort(),
    rarities: [...rarities].sort((a, b) => {
      const ia = RARITY_DISPLAY_ORDER.indexOf(a);
      const ib = RARITY_DISPLAY_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }),
    sets: [...sets].sort(),
    setNames,
    families: [...families].sort(),
    variants: [...variants].sort(),
  };
}
