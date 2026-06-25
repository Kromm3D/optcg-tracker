// Metadatos de los sets (nombre legible + fecha de lanzamiento) que comparten
// SetsScreen y SetDetailScreen. Centralizamos aqui para evitar duplicar el
// mapa de nombres que antes vivia dentro de SetDetailScreen.

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
  EB01: '03/05/2024',
  EB02: '09/05/2025',
  EB03: '20/02/2026',
  PRB01: '08/11/2024',
  PRB02: '03/10/2025',
};

/** Nombre legible del set; fallback al propio codigo. */
export function setNameFor(code: string): string {
  return SET_NAMES[code] ?? code;
}

/** Fecha de lanzamiento del set, o cadena vacia si no se conoce. */
export function setDateFor(code: string): string {
  return SET_DATES[code] ?? '';
}
