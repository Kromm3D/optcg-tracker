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

/** Item de wishlist - solo codigo base. */
export interface WishlistItem {
  code: string;
  addedAt: number;
}
