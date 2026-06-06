// Carga el índice de cartas desde el fichero JSON generado por
// scripts/build_card_database.py en la raíz del repo.
//
// Metro permite resolver este import gracias a `watchFolders` en
// metro.config.js, que extiende la raíz un nivel por encima de app/.

import type { Card, IndexPayload } from '../types';

// @ts-ignore — avoids tsc inferring the huge literal type of the JSON.
import rawJson from './index.json';
// @ts-ignore
import rawHashes from './hashes.json';

const raw = rawJson as IndexPayload;
const hashData = rawHashes as { hash_algo: string; hash_size: number; hash_count: number; hashes: Record<string, string> };

/** Orden canónico de variantes: base > _p1 > _p2 > … > _r1 > _r2 > … > resto. */
function variantSortKey(suffix: string): [number, number] {
  if (suffix === '') return [0, 0];
  const inner = suffix.replace(/^_/, '');
  if (inner.startsWith('p')) { const n = parseInt(inner.slice(1), 10); return [1, isNaN(n) ? 999 : n]; }
  if (inner.startsWith('r')) { const n = parseInt(inner.slice(1), 10); return [2, isNaN(n) ? 999 : n]; }
  return [3, 0];
}

/** Diccionario código → carta (variantes ordenadas). */
export const CARDS: Record<string, Card> = (() => {
  for (const card of Object.values(raw.cards)) {
    card.variants.sort((a, b) => {
      const [ak, an] = variantSortKey(a.suffix);
      const [bk, bn] = variantSortKey(b.suffix);
      return ak !== bk ? ak - bk : an - bn;
    });
  }
  return raw.cards;
})();

/** Lista ordenada por código (útil para vistas planas). */
export const CARD_LIST: Card[] = Object.values(raw.cards).sort(
  (a: Card, b: Card) => a.code.localeCompare(b.code)
);

/** Metadatos generales del índice. */
export const INDEX_META = {
  generatedWith: raw.generated_with,
  source: raw.source,
  cardCount: raw.card_count,
};

/** release_order por código de set (0 = más reciente). */
export const SET_META: Record<string, { release_order: number }> = raw.set_meta ?? {};

/** Pre-computed perceptual hashes: variantKey -> 16-char hex string. */
export const PHASHES: Record<string, string> = hashData.hashes;
