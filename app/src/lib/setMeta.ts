// Metadatos de los sets (nombre legible + fecha de lanzamiento) que comparten
// SetsScreen y SetDetailScreen. Centralizamos aqui para evitar duplicar el
// mapa de nombres que antes vivia dentro de SetDetailScreen.
//
// El NOMBRE ya no se mantiene a mano: el scraper lo deduce de las propias
// cartas y lo publica en `set_meta[code].name` del indice, asi que un set nuevo
// llega con nombre por el CDN sin actualizar la app. El mapa de abajo se queda
// como respaldo para indices viejos (y como red si el sitio cambia de formato).
//
// La FECHA tampoco: el scraper la saca de la pagina de productos oficial (que
// solo lista lo anunciado, justo lo que falta) y la publica en
// `set_meta[code].release_date`. El mapa manual de abajo cubre el historico,
// que ya no cambia. Un set sin fecha por ningun lado simplemente no sale en el
// calendario de lanzamientos; no rompe nada.

import { SET_META } from '../data/loadIndex';

/** Campos que el indice puede traer por set (ver build_card_database.py). */
type IndexSetMeta = { name?: string; release_date?: string };

function fromIndex(code: string): IndexSetMeta {
  return (SET_META[code] as IndexSetMeta | undefined) ?? {};
}

const SET_NAMES: Record<string, string> = {
  OP01: 'Romance Dawn',
  OP02: 'Paramount War',
  OP03: 'Pillars of Strength',
  OP04: 'Kingdoms of Intrigue',
  OP05: 'Awakening of the New Era',
  OP06: 'Wings of the Captain',
  OP07: '500 Years in the Future',
  OP08: 'Two Legends',
  OP09: 'Emperors in the New World',
  OP10: 'Royal Blood',
  OP11: 'A Fist of Divine Speed',
  OP12: 'Legacy of the Master',
  OP13: 'Carrying on His Will',
  OP14: "The Azure Sea's Seven",
  OP15: "Adventure on Kami's Island",
  OP16: 'The Time of Battle',
  OP17: "The World's Strongest Warriors",
  EB01: 'Memorial Collection',
  EB02: 'Anime 25th Collection',
  EB03: 'One Piece Heroines Edition',
  // EB04 no es un producto EN propio: va empaquetado con OP14 ("OP14-EB04",
  // 16/01/2026) Y con OP15 ("OP15-EB04", 03/04/2026) como dos lanzamientos
  // distintos — no tiene una fecha/nombre único que asignarle aquí.
  EB04: 'Extra Booster 04',
  PRB01: 'One Piece Card the Best',
  PRB02: 'One Piece Card the Best vol.2',
  P: 'Promos',
  // Sub-buckets de evento/promo (sin código de set canónico)
  '__ev_prerelease':  'Pre-Release Events',
  '__ev_treasurecup': 'Treasure Cup',
  '__ev_regional':    'Regionals',
  '__ev_cs':          'Championship Series',
  '__ev_tournament':  'Tournament Packs',
  '__ev_store':       'Store Events',
  '__ev_collection':  'Special Collections',
  '__ev_other':       'Other Events',
};

// Fecha de lanzamiento EN (formato DD/MM/YYYY), verificada contra el campo
// "Release Date" real de en.onepiece-cardgame.com/products (no la fecha JP -
// la tabla anterior mezclaba ambas y quedó con casi todos los valores mal).
// Solo los sets que conocemos; el resto cae al fallback (sin fecha).
const SET_DATES: Record<string, string> = {
  OP01: '02/12/2022',
  OP02: '10/03/2023',
  OP03: '30/06/2023',
  OP04: '22/09/2023',
  OP05: '08/12/2023',
  OP06: '15/03/2024',
  OP07: '28/06/2024',
  OP08: '13/09/2024',
  OP09: '13/12/2024',
  OP10: '21/03/2025',
  OP11: '06/06/2025',
  OP12: '22/08/2025',
  OP13: '07/11/2025',
  OP14: '16/01/2026',
  OP15: '03/04/2026',
  OP16: '12/06/2026',
  // Aún no lanzado (a 02/08/2026). Primer set con lanzamiento mundial el mismo
  // día; la fecha EN de EE.UU. es el 28/08 (JP 22/08, UK 26/08). Se usa la de
  // EE.UU. por coherencia con el resto de la tabla, que sigue el sitio EN.
  OP17: '28/08/2026',
  EB01: '03/05/2024',
  EB02: '09/05/2025',
  EB03: '20/02/2026',
  PRB01: '08/11/2024',
  PRB02: '03/10/2025',
};

/** Nombre legible del set; fallback al propio codigo. */
export function setNameFor(code: string): string {
  return fromIndex(code).name || SET_NAMES[code] || code;
}

/** Fecha de lanzamiento del set, o cadena vacia si no se conoce. */
export function setDateFor(code: string): string {
  return fromIndex(code).release_date || SET_DATES[code] || '';
}

/** La misma fecha como `Date`, para ordenar y comparar. `null` si se desconoce.
 *  Se parsea a mano porque `new Date('12/06/2026')` interpreta el formato como
 *  MM/DD en runtimes con locale en-US — un bug silencioso de medio año. */
export function setDateAsDate(code: string): Date | null {
  const raw = setDateFor(code);
  if (!raw) return null;
  const [d, m, y] = raw.split('/').map((n) => parseInt(n, 10));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

/** Todos los sets con fecha conocida, del más reciente al más antiguo. */
export function setsByReleaseDate(): Array<{ code: string; name: string; date: Date }> {
  // Union de los dos origenes: el historico manual y lo que traiga el indice.
  // Si solo se recorriese SET_DATES, un set nuevo con fecha del CDN no saldria
  // nunca en el calendario, que es justo el caso que esto viene a resolver.
  const codes = new Set([...Object.keys(SET_DATES), ...Object.keys(SET_META)]);
  return Array.from(codes)
    .map((code) => ({ code, name: setNameFor(code), date: setDateAsDate(code)! }))
    .filter((s) => s.date != null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
