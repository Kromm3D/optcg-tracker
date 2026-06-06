// Metadatos de los sets (nombre legible + fecha de lanzamiento) que comparten
// SetsScreen y SetDetailScreen. Centralizamos aqui para evitar duplicar el
// mapa de nombres que antes vivia dentro de SetDetailScreen.

const SET_NAMES: Record<string, string> = {
  OP01: 'Romance Dawn',
  OP02: 'Paramount War',
  OP03: 'Mighty Enemies',
  OP04: 'Kingdoms of Intrigue',
  OP05: 'Awakening of the New Era',
  OP06: 'Wings of the Captain',
  OP07: '500 Years in the Future',
  OP08: 'Two Legends',
  OP09: 'Emperors in the New World',
  OP10: 'Royal Blood',
  OP11: 'A Fist of Divine Speed',
  OP12: 'Legacy of the Master',
  OP13: 'The Three Captains',
  OP14: 'Beyond the Horizon',
  OP15: 'New Generation of Pirates',
  OP16: 'The Time of Battle',
  EB01: 'Memorial Collection',
  EB02: 'Anime 25th Collection',
  EB03: 'Extra Booster 03',
  EB04: 'Extra Booster 04',
  PRB01: 'One Piece Card the Best',
  PRB02: 'Premium Booster 02',
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

// Fecha de lanzamiento (formato DD/MM/YYYY) tal como la muestra el header.
// Solo los sets que conocemos; el resto cae al fallback (sin fecha).
const SET_DATES: Record<string, string> = {
  OP01: '02/12/2022',
  OP02: '27/01/2023',
  OP03: '07/04/2023',
  OP04: '22/06/2023',
  OP05: '08/09/2023',
  OP06: '08/12/2023',
  OP07: '23/02/2024',
  OP08: '17/05/2024',
  OP09: '13/09/2024',
  OP10: '13/12/2024',
  OP11: '21/02/2025',
  OP12: '30/05/2025',
  OP13: '25/07/2025',
  OP14: '26/09/2025',
  OP15: '05/12/2025',
  OP16: '12/06/2026',
  EB01: '21/04/2023',
  EB02: '29/11/2024',
};

/** Nombre legible del set; fallback al propio codigo. */
export function setNameFor(code: string): string {
  return SET_NAMES[code] ?? code;
}

/** Fecha de lanzamiento del set, o cadena vacia si no se conoce. */
export function setDateFor(code: string): string {
  return SET_DATES[code] ?? '';
}
