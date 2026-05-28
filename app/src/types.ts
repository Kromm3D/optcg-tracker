// Modelo de datos de las cartas, tal y como las produce
// scripts/build_card_database.py en data/index.json.

export interface Variant {
  /** Sufijo de la variante derivado de la URL de la imagen (p.ej. "", "_p1", "_r1"). */
  suffix: string;
  /** Etiqueta legible para enseñar al usuario (Normal, Parallel, Manga...). */
  label: string;
  /** Rareza tal y como la devuelve la API (L, SR, R, UC, C...). */
  rarity: string;
  /** Nombre completo con sufijos entre paréntesis si los tiene. */
  full_name: string;
  /** Ruta relativa al fichero local (dentro del repo, en images/). */
  image_local: string;
  /** URL original en el CDN de OPTCG API, fuente de la imagen. */
  image_source: string;
}

export interface Card {
  /** Código base de la carta (p.ej. "OP01-001"). */
  code: string;
  /** Nombre limpio sin sufijos de variante. */
  name: string;
  /** Todas las variantes conocidas para este código. */
  variants: Variant[];
}

/** Estructura del fichero data/index.json. */
export interface IndexPayload {
  generated_with: string;
  source: string;
  card_count: number;
  cards: Record<string, Card>;
}

/** Estado de una variante en la colección del usuario. */
export interface CollectionItem {
  /** Clave única: `${code}${suffix}` (ej. "OP01-001_p1"). */
  key: string;
  code: string;
  suffix: string;
  count: number;
}
