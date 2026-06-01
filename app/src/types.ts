// Modelo de datos de las cartas, tal como las produce
// scripts/build_card_database.py en data/index.json.

export interface Variant {
  /** Sufijo de la variante derivado de la URL de imagen (ej: "", "_p1", "_r1"). */
  suffix: string;
  /** Etiqueta legible (Normal, Parallel, Manga...). */
  label: string;
  /** Rareza tal como la devuelve la API (L, SR, R, UC, C...). */
  rarity: string;
  /** Nombre completo con sufijos. */
  full_name: string;
  /** Ruta relativa al fichero local. */
  image_local: string;
  /** URL original en el CDN de OPTCG API. */
  image_source: string;
  /** Set donde esta variante fue lanzada (ej: "EB02"). Puede diferir del
   *  prefijo del código base cuando es un reprint o parallel de otro set. */
  set_source?: string;
  /** Set canónico de impresión, derivado del corchete [XX-NN] en el get_info
   *  del sitio oficial. `null` = evento/promo sin código de set (Treasure Cup,
   *  Grand Battle, etc.). `undefined` = datos legacy sin este campo. */
  printed_set?: string | null;
  /** Texto legible de la sección "Card Set(s)" del sitio oficial para esta
   *  variante concreta (ej: "Anime 25th Collection",
   *  "Extra Grand Battle for Stores 2026 May"). */
  get_info?: string;
}

export interface Card {
  /** Codigo base de la carta. */
  code: string;
  /** Nombre limpio sin sufijos de variante. */
  name: string;
  /** Colores. Multicolor -> varios items. */
  colors?: string[];
  /** Coste para jugarla (None en Leaders). */
  cost?: number | null;
  /** Poder, multiplo de 1000. */
  power?: number | null;
  /** Counter (1000/2000/None). */
  counter?: number | null;
  /** Leader / Character / Event / Stage / Don */
  type?: string;
  /** Slash / Strike / Special / Wisdom / Ranged */
  attribute?: string;
  /** Texto de habilidades. */
  effect?: string;
  /** Trigger. */
  trigger?: string;
  /** Nombre legible del set. */
  set_name?: string;
  /** Familia / trait - "Whitebeard Pirates", "Land of Wano"... */
  family?: string;
  /** Block icon - "1", "2", "3", "4", "5", "X". */
  block?: string;
  /** Todas las variantes conocidas. */
  variants: Variant[];
}

/** Estructura del fichero data/index.json. */
export interface IndexPayload {
  generated_with: string;
  source: string;
  card_count: number;
  cards: Record<string, Card>;
}

/** Estado de una variante en la coleccion. */
export interface CollectionItem {
  /** Clave unica: code+suffix. */
  key: string;
  code: string;
  suffix: string;
  count: number;
}

/** @deprecated Legacy single-wishlist entry. Use WishlistCard instead. */
export interface WishlistItem {
  code: string;
  addedAt: number;
  needed?: number;
}

/** A single card+variant entry inside a named wishlist. */
export interface WishlistCard {
  code: string;
  /** Variant suffix: "" = base/non-parallel, "_p1" = first parallel, etc. */
  suffix: string;
  needed: number;
  addedAt: number;
}

/** A named wishlist containing multiple card entries. */
export interface Wishlist {
  id: string;
  name: string;
  /** Keyed by `${code}${suffix}` (same as collection variantKey). */
  cards: Record<string, WishlistCard>;
  createdAt: number;
}
