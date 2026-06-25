// cardDisplay.ts — single source of truth for "what tiles a grid renders".
//
// When the global `showAlternateArt` setting is OFF, every card collapses to a
// single tile that uses its normal (non-parallel) art. When it is ON, each art
// variant becomes its own tile/slot, so a card with a normal print plus two
// parallels yields three tiles.

import { getSettings } from './settings';
import type { SetEntry } from './setsStats';
import type { Card, Variant } from '../types';

export type DisplayEntry = {
  card: Card;
  variant: Variant;
  /** Stable key `${code}${suffix}` — matches collection/wishlist variant keys. */
  key: string;
  /** When this tile represents a set entry, the variants of the card that
   *  belong to that set. Lets the grid count owned copies per-set (collapsed
   *  view) instead of summing every printing across all sets. */
  setVariants?: Variant[];
};

/** SP CARD rarity = bonus chase insert, never a "standard" print. A card whose
 *  only printing in a set is one of these has no real normal art there. */
function isSpecialInsert(v: Variant): boolean {
  return v.rarity?.toUpperCase().startsWith('SP') ?? false;
}

/** Pick the normal/base variant of a card: empty suffix if present, else first. */
export function normalVariant(card: Card): Variant | undefined {
  return card.variants.find((v) => v.suffix === '') ?? card.variants[0];
}

/** Same idea as normalVariant, but scoped to the variants printed in one set:
 *  prefer the empty-suffix print, then any non-SP print, and only fall back to
 *  an SP insert if that's truly the only thing this card has in this set. */
function normalInSet(variants: Variant[]): Variant | undefined {
  return (
    variants.find((v) => v.suffix === '') ??
    variants.find((v) => !isSpecialInsert(v)) ??
    variants[0]
  );
}

/** Expand a list of cards into the tiles a grid should show, honoring the
 *  showAlternateArt setting. Used by global grids (Browse) where a card is
 *  represented by all of its variants. */
export function expandCards(cards: Card[]): DisplayEntry[] {
  const showAlt = getSettings().showAlternateArt;
  const out: DisplayEntry[] = [];
  for (const card of cards) {
    if (showAlt && card.variants.length > 0) {
      for (const variant of card.variants) {
        out.push({ card, variant, key: `${card.code}${variant.suffix}` });
      }
    } else {
      const variant = normalVariant(card);
      if (variant) out.push({ card, variant, key: `${card.code}${variant.suffix}` });
      else out.push({ card, variant: undefined as unknown as Variant, key: card.code });
    }
  }
  return out;
}

/** Expand a set's entries into grid tiles, showing only the variants printed
 *  in that set. With parallels off, each entry collapses to one tile using its
 *  in-set representative (empty suffix if present, else the first non-SP
 *  in-set variant) — so a cross-set reprint like the EB02 Gold Leader shows
 *  its own art, not the original set's normal print. A card whose ONLY
 *  printing in this set is an SP CARD chase insert (e.g. a past Leader
 *  reprinted as an SP parallel in a later set) has no normal art here at all,
 *  so it's dropped from this set's view entirely instead of falling back to
 *  showing the SP art as if it were standard. */
export function expandSetEntries(entries: SetEntry[]): DisplayEntry[] {
  const showAlt = getSettings().showAlternateArt;
  const out: DisplayEntry[] = [];
  for (const { card, variants } of entries) {
    if (showAlt && variants.length > 0) {
      for (const variant of variants) {
        out.push({ card, variant, key: `${card.code}${variant.suffix}`, setVariants: variants });
      }
    } else {
      const variant = normalInSet(variants);
      if (variant && isSpecialInsert(variant) && variants.every(isSpecialInsert)) continue;
      if (variant) out.push({ card, variant, key: `${card.code}${variant.suffix}`, setVariants: variants });
      else out.push({ card, variant: undefined as unknown as Variant, key: card.code, setVariants: variants });
    }
  }
  return out;
}
