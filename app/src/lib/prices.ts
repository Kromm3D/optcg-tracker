// Mock market price data for Sprint 4: Vault Value Analytics.
// Base prices are estimated per rarity tier. Individual high-profile cards
// (SEC leaders, tournament staples) carry a premium override.

import type { Card } from '../types';

/** Base price (EUR) per rarity code. */
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

/** Per-card price overrides (card code → price in EUR). */
const CARD_OVERRIDES: Record<string, number> = {
  // OP01 — Romance Dawn
  'OP01-001': 18.00, // Roronoa Zoro SEC
  'OP01-060': 9.50,  // Shanks L
  'OP01-002': 4.00,  // Nami SR
  // OP02 — Paramount War
  'OP02-001': 22.00, // Whitebeard SEC
  'OP02-099': 11.00, // Ace L
  // OP03 — Pillars of Strength
  'OP03-001': 15.00, // Yamato SEC
  // OP04 — Kingdoms of Intrigue
  'OP04-001': 25.00, // Robin SEC
  'OP04-058': 14.00, // Boa Hancock L
  // OP05 — Awakening of the New Era
  'OP05-119': 28.00, // Enel SEC
  // OP06 — Wings of the Captain
  'OP06-001': 20.00, // Sanji SEC
  // ST01 — Starter Deck Straw Hat Crew
  'ST01-001': 3.00,
};

/** Return the estimated market price for a card (uses first variant rarity). */
export function getPrice(card: Card): number {
  if (CARD_OVERRIDES[card.code] !== undefined) {
    return CARD_OVERRIDES[card.code];
  }
  const rarity = card.variants[0]?.rarity ?? 'C';
  return RARITY_BASE[rarity] ?? 0.10;
}

/** Return the display label for a rarity. */
export function rarityLabel(rarity: string): string {
  const map: Record<string, string> = {
    C: 'Common', UC: 'Uncommon', R: 'Rare',
    SR: 'Super Rare', SEC: 'Secret Rare', L: 'Leader',
    P: 'Promo', SP: 'Special', TR: 'Treasure Rare',
  };
  return map[rarity] ?? rarity;
}

/** Holographic gradient flag — true for premium rarities. */
export const HOLO_RARITIES = new Set(['SR', 'SEC', 'SP', 'TR', 'L']);
