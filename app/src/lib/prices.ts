// Precios de mercado de cartas One Piece TCG.
//
// Fuente primaria: data/prices.json generado por scripts/build_prices.py
// (scrapea Cardmarket, se actualiza semanalmente y se sirve via jsDelivr CDN).
//
// Fallback: estimacion por rareza cuando la carta no tiene precio real cargado.

import type { Card } from '../types';

// ---------------------------------------------------------------------------
// Carga del fichero de precios (generado por build_prices.py)
// ---------------------------------------------------------------------------

interface PriceEntry {
  product_url?: string;
  updated?: string;
  // Campos legacy — nunca escritos por build_prices.py pero tolerados para
  // compatibilidad con entradas antiguas que pudiera tener el usuario.
  trend?: number | null;
  low?: number | null;
}

interface PricesPayload {
  generated: string;
  source: string;
  currency: string;
  fetched: number;
  prices: Record<string, PriceEntry>;
}

// @ts-ignore - evita que tsc infiera el tipo literal del JSON enorme
import rawPrices from '../data/prices.json';

const _payload = rawPrices as PricesPayload;

/** Mapa variant_key -> { trend, low } cargado desde prices.json. */
const PRICE_MAP: Record<string, PriceEntry> = _payload.prices ?? {};

/** Metadatos del fichero de precios (para mostrar "actualizado el ..."). */
export const PRICES_META = {
  generated: _payload.generated ?? '',
  source: _payload.source ?? '',
  fetched: _payload.fetched ?? 0,
};

// ---------------------------------------------------------------------------
// Estimacion de fallback por rareza
// ---------------------------------------------------------------------------

/** Precio base estimado (EUR) por codigo de rareza. */
const RARITY_BASE: Record<string, number> = {
  C:   0.10,
  UC:  0.30,
  R:   1.00,
  SR:  3.50,
  SEC: 12.00,
  L:   5.00,
  P:   0.50,
  SP:  8.00,
  TR:  7.00,
};

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

/**
 * Devuelve el precio de mercado de una variante concreta.
 *
 * Prioridad:
 *   1. trend real para la clave exacta "{code}{suffix}"
 *   2. low real para la clave exacta
 *   3. trend real para la variante base "{code}"
 *   4. low real para la variante base
 *   5. Estimacion por rareza (fallback cuando prices.json esta vacio)
 */
export function getPrice(card: Card, suffix: string = ''): number {
  const variantKey = `${card.code}${suffix}`;
  const baseKey    = card.code;

  const exactEntry = PRICE_MAP[variantKey];
  if (exactEntry?.trend != null) return exactEntry.trend;
  if (exactEntry?.low   != null) return exactEntry.low;

  const baseEntry = PRICE_MAP[baseKey];
  if (baseEntry?.trend != null) return baseEntry.trend;
  if (baseEntry?.low   != null) return baseEntry.low;

  const rarity = suffix
    ? card.variants.find(v => v.suffix === suffix)?.rarity ?? card.variants[0]?.rarity ?? 'C'
    : card.variants[0]?.rarity ?? 'C';
  return RARITY_BASE[rarity] ?? 0.10;
}

/**
 * Precio "desde" (el mas barato disponible en el mercado) para una variante.
 */
export function getLowPrice(card: Card, suffix: string = ''): number {
  const variantKey = `${card.code}${suffix}`;
  const baseKey    = card.code;

  const exactEntry = PRICE_MAP[variantKey];
  if (exactEntry?.low != null) return exactEntry.low;

  const baseEntry = PRICE_MAP[baseKey];
  if (baseEntry?.low != null) return baseEntry.low;

  return getPrice(card, suffix);
}

/**
 * True si el precio viene de datos reales de Cardmarket (no es una estimacion).
 */
export function hasRealPrice(card: Card, suffix: string = ''): boolean {
  const variantKey = `${card.code}${suffix}`;
  const exact = PRICE_MAP[variantKey];
  const base  = PRICE_MAP[card.code];
  return (
    exact?.trend != null || exact?.low != null ||
    base?.trend  != null || base?.low  != null
  );
}

/**
 * URL directa al producto en Cardmarket para una variante concreta.
 * Devuelve null si prices.json no tiene esa variante (usa el fallback de búsqueda).
 */
export function getProductUrl(code: string, suffix: string = ''): string | null {
  const variantKey = `${code}${suffix}`;
  return PRICE_MAP[variantKey]?.product_url ?? PRICE_MAP[code]?.product_url ?? null;
}

/** Etiqueta legible de una rareza. */
export function rarityLabel(rarity: string): string {
  const map: Record<string, string> = {
    C: 'Common', UC: 'Uncommon', R: 'Rare',
    SR: 'Super Rare', SEC: 'Secret Rare', L: 'Leader',
    P: 'Promo', SP: 'Special', TR: 'Treasure Rare',
  };
  return map[rarity] ?? rarity;
}

/** Rareza holografica - true para las raridades premium. */
export const HOLO_RARITIES = new Set(['SR', 'SEC', 'SP', 'TR', 'L']);
