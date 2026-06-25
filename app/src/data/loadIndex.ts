// Carga el índice de cartas desde el fichero JSON generado por
// scripts/build_card_database.py y copiado a app/src/data/index.json.
// El fichero vive dentro de app/, así que Metro lo resuelve sin necesidad
// de extender watchFolders a la raíz del repo.
//
// CARDS/CARD_LIST/etc se exportan como `let` (bindings ESM vivos) en vez de
// `const`: cuando lib/remoteIndex.ts detecta un set nuevo en el CDN y el
// usuario confirma el refresh, applyIndexPayload() recalcula y reasigna estos
// bindings in situ. Los módulos que hacen `import { CARDS } from ...` y leen
// `CARDS[code]` en el momento de uso (no lo destructuran al importar) ven el
// valor nuevo automáticamente — sin tocar cada pantalla que ya consume CARDS.

import type { Card, IndexMetaPayload, IndexPayload } from '../types';

// @ts-ignore — avoids tsc inferring the huge literal type of the JSON.
import rawJson from './index.json';
// @ts-ignore — same: skip inferring the huge literal type of the hash map.
import rawHashes from './hashes.json';
// @ts-ignore
import rawMeta from './meta.json';

type HashPayload = {
  hash_algo: string;
  hash_size: number;
  hash_count: number;
  hashes: Record<string, string>;
};

/** Orden canónico de variantes: base > _p1 > _p2 > … > _r1 > _r2 > … > resto. */
function variantSortKey(suffix: string): [number, number] {
  if (suffix === '') return [0, 0];
  const inner = suffix.replace(/^_/, '');
  if (inner.startsWith('p')) { const n = parseInt(inner.slice(1), 10); return [1, isNaN(n) ? 999 : n]; }
  if (inner.startsWith('r')) { const n = parseInt(inner.slice(1), 10); return [2, isNaN(n) ? 999 : n]; }
  return [3, 0];
}

function buildCards(payload: IndexPayload): Record<string, Card> {
  for (const card of Object.values(payload.cards)) {
    card.variants.sort((a, b) => {
      const [ak, an] = variantSortKey(a.suffix);
      const [bk, bn] = variantSortKey(b.suffix);
      return ak !== bk ? ak - bk : an - bn;
    });
  }
  return payload.cards;
}

/** Diccionario código → carta (variantes ordenadas). */
export let CARDS: Record<string, Card> = buildCards(rawJson as IndexPayload);

/** Lista ordenada por código (útil para vistas planas). */
export let CARD_LIST: Card[] = Object.values(CARDS).sort(
  (a: Card, b: Card) => a.code.localeCompare(b.code)
);

/** Metadatos generales del índice. */
export let INDEX_META = {
  generatedWith: (rawJson as IndexPayload).generated_with,
  source: (rawJson as IndexPayload).source,
  cardCount: (rawJson as IndexPayload).card_count,
  schemaVersion: (rawJson as IndexPayload).schema_version ?? 0,
  version: (rawJson as IndexPayload).version ?? 0,
};

/** release_order por código de set (0 = más reciente). */
export let SET_META: Record<string, { release_order: number }> = (rawJson as IndexPayload).set_meta ?? {};

/** Hashes perceptuales pre-calculados: variantKey ("OP01-001"/"OP01-001_p1") → hex (192). */
export let PHASHES: Record<string, string> = (rawHashes as HashPayload).hashes;

/** Meta ligero bundleado (data/meta.json) — punto de partida antes de
 *  comprobar si hay algo más nuevo en el CDN. */
export const BUNDLED_META: IndexMetaPayload = rawMeta as IndexMetaPayload;

/**
 * Aplica un índice (y opcionalmente sus hashes) descargado del CDN, reemplazando
 * CARDS/CARD_LIST/INDEX_META/SET_META in situ. Los imports existentes ven el
 * cambio vía live bindings de ESM — no hace falta tocar cada consumidor.
 */
export function applyIndexPayload(payload: IndexPayload, hashes?: HashPayload): void {
  CARDS = buildCards(payload);
  CARD_LIST = Object.values(CARDS).sort((a, b) => a.code.localeCompare(b.code));
  INDEX_META = {
    generatedWith: payload.generated_with,
    source: payload.source,
    cardCount: payload.card_count,
    schemaVersion: payload.schema_version ?? 0,
    version: payload.version ?? 0,
  };
  SET_META = payload.set_meta ?? {};
  if (hashes) {
    PHASHES = hashes.hashes;
  }
}
