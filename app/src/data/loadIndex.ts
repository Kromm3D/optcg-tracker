// Carga el índice de cartas desde el fichero JSON generado por
// scripts/build_card_database.py en la raíz del repo.
//
// Metro permite resolver este import gracias a `watchFolders` en
// metro.config.js, que extiende la raíz un nivel por encima de app/.

import type { Card, IndexPayload } from '../types';

// El @ts-ignore evita que tsc intente inferir el tipo literal del JSON
// (1.6 MB, sería lento). Casteamos al tipo correcto justo después.
// @ts-ignore — Metro resuelve este import fuera del directorio app/.
import rawJson from '../../../data/index.json';

const raw = rawJson as IndexPayload;

/** Diccionario código → carta. */
export const CARDS: Record<string, Card> = raw.cards;

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
