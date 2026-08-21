// Exporta la colección a CSV. Sin dependencias nativas nuevas a propósito
// (nada de expo-file-system): el texto se comparte por el mismo camino que
// ya usa DeckDetailScreen para el código OPTCGSim — Share.share() en nativo,
// Clipboard en web. Coleciones muy grandes podrían chocar con el límite de
// texto de algún destino del share sheet; si eso pasa en la práctica, la
// solución es un CSV a fichero + expo-sharing, no está aquí todavía.

import { CARDS } from '../data/loadIndex';
import type { CollectionItem } from '../types';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Construye el CSV de la colección: una fila por variante con al menos 1 copia. */
export function buildCollectionCsv(items: CollectionItem[]): string {
  const header = [
    'code',
    'suffix',
    'name',
    'set',
    'count',
    'condition',
    'language',
    'acquired_unit_price',
    'acquired_at',
  ];
  const rows = items
    .filter((it) => it.count > 0)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.suffix.localeCompare(b.suffix))
    .map((it) => {
      const card = CARDS[it.code];
      return [
        it.code,
        it.suffix,
        card?.name ?? '',
        it.code.split('-')[0] ?? '',
        String(it.count),
        it.condition ?? '',
        it.language ?? '',
        it.acquiredUnitPrice != null ? String(it.acquiredUnitPrice) : '',
        it.acquiredAt ? new Date(it.acquiredAt).toISOString() : '',
      ]
        .map((v) => csvEscape(v))
        .join(',');
    });
  return [header.join(','), ...rows].join('\n');
}
