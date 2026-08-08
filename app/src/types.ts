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

/** Metadatos de un set derivados del desplegable del sitio oficial. */
export interface SetMeta {
  /** Posición en el desplegable: 0 = más reciente. */
  release_order: number;
}

/** Estructura del fichero data/index.json. */
export interface IndexPayload {
  generated_with: string;
  source: string;
  card_count: number;
  /** release_order por código de set (p.ej. "OP01": {release_order: 20}). */
  set_meta?: Record<string, SetMeta>;
  cards: Record<string, Card>;
  /** Forma de IndexPayload entendida por este build. Ausente en índices antiguos. */
  schema_version?: number;
  /** Timestamp (epoch seconds) de generación; usado para detectar actualizaciones remotas. */
  version?: number;
}

/** Fichero ligero data/meta.json — permite comprobar si hay índice nuevo sin
 *  descargar el index.json completo (varios MB). */
export interface IndexMetaPayload {
  schema_version: number;
  version: number;
  card_count: number;
  /** Código del set más reciente (release_order 0), o null si no hay set_meta. */
  newest_set: string | null;
}

/** Estado físico de una carta, en la escala estándar de Cardmarket/TCGplayer.
 *  `undefined` en un CollectionItem = sin especificar (se asume NM al valorar). */
export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

/** Idioma de impresión de la copia física. */
export type CardLanguage = 'EN' | 'JP' | 'ES' | 'FR' | 'DE' | 'IT' | 'CN' | 'KR';

/** Datos de gradeo profesional (PSA/BGS/CGC…). */
export interface GradedInfo {
  /** Empresa gradeadora, texto libre en mayúsculas (PSA, BGS, CGC…). */
  company: string;
  /** Nota, típicamente 1–10 (BGS admite .5). */
  grade: number;
}

/** Estado de una variante en la coleccion.
 *
 *  **Nota de modelo (2026-08-02):** los metadatos físicos (condición, idioma,
 *  gradeo, coste base) son **por variante**, no por copia — es decir, describen
 *  el montón entero de esa variante. Separar por condición exigiría cambiar la
 *  clave `${code}${suffix}` que usan la colección, el trade, la sync y las
 *  tablas de Supabase. Se acepta la simplificación a cambio de no romper nada.
 */
export interface CollectionItem {
  /** Clave unica: code+suffix. */
  key: string;
  code: string;
  suffix: string;
  count: number;
  /** Timestamp (ms) del último cambio. Usado por la sync LWW (last-write-wins).
   *  `undefined` = dato legacy sin sellar (se trata como el más antiguo). */
  updatedAt?: number;
  /** Estado físico del montón. `undefined` = sin especificar → se valora como NM. */
  condition?: CardCondition;
  /** Idioma de impresión. `undefined` = sin especificar → se asume EN. */
  language?: CardLanguage;
  /** Presente sólo si las copias están gradeadas. */
  graded?: GradedInfo;
  /** Lo que pagaste **por copia**, en la divisa base del catálogo (EUR).
   *  `undefined` = desconocido → esa variante no cuenta para el P&L. */
  acquiredUnitPrice?: number;
  /** Timestamp (ms) de adquisición, para futuros informes por periodo. */
  acquiredAt?: number;
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
  /** Timestamp (ms) of the last change. Used by cloud sync. */
  updatedAt?: number;
  /** true = tombstone (deleted locally, pending propagation). See B-17. */
  deleted?: boolean;
}

// ─── Cloud sync / friends (Supabase) ────────────────────────────────────────

/** Per-resource visibility for the friends system. Mirrors the SQL enum. */
export type Visibility = 'public' | 'friends' | 'private';

/** A user's privacy choices, one per shareable resource. */
export interface PrivacySettings {
  collection: Visibility;
  wishlist: Visibility;
  decks: Visibility;
}

/** Status of a friendship edge. Mirrors the SQL enum. */
export type FriendStatus = 'pending' | 'accepted' | 'blocked';

/** Public profile fields surfaced in friend search / friend lists. */
export interface FriendProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** A friendship edge plus the other party's profile, as shown in the UI. */
export interface FriendEdge {
  id: string;
  status: FriendStatus;
  /** true if the current user sent the request (vs received it). */
  outgoing: boolean;
  profile: FriendProfile;
}
