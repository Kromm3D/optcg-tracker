// Theme tokens (colores, tipografias, espacio). Inspirado en el handoff
// de Claude Design pero adaptado a OPTCG: cambiamos las "factions" del
// proto por los 6 colores oficiales de One Piece TCG.

export const colors = {
  bg: '#0e0c1a',
  surface: '#151226',
  surface2: '#1e1a30',
  border: 'rgba(236,72,153,0.12)',
  text: '#f4f0ff',
  // Secondary text. ~5.0:1 sobre bg — pasa WCAG AA para texto normal.
  textMut: '#9d91b8',
  // Texto terciario. Subido de #5e5478 (≈2.3:1, fallaba AA) a #8b7fae
  // (≈4.0:1 sobre bg) para que códigos/subtítulos/placeholder sean legibles.
  // Nunca usar para etiquetas de navegación o texto <14px crítico.
  textDim: '#8b7fae',
  accent: '#ec4899',
  accentDim: 'rgba(236,72,153,0.13)',
  accentGlow: 'rgba(236,72,153,0.35)',
  badge: '#ec4899',
  ring: 'rgba(236,72,153,0.18)',
  up: '#4ec98b',
  down: '#ef5d6b',
};

// Los 6 colores oficiales de OPTCG. Hex usados para el dot/badge.
// Tone es la tinta del fondo de la miniatura cuando no hay imagen real.
export const OPTCG_COLORS: Record<string, { name: string; color: string; tone: string }> = {
  Red:    { name: 'Red',    color: '#e63946', tone: '#3a1318' },
  Green:  { name: 'Green',  color: '#52b788', tone: '#0f2a1f' },
  Blue:   { name: 'Blue',   color: '#4a90e2', tone: '#0e2138' },
  Purple: { name: 'Purple', color: '#9b5de5', tone: '#1d1230' },
  Black:  { name: 'Black',  color: '#a8a39a', tone: '#1a1a1a' },
  Yellow: { name: 'Yellow', color: '#f4a261', tone: '#322012' },
};

export const COLOR_KEYS = Object.keys(OPTCG_COLORS);

/** Devuelve el color visual de un OPTCG_COLOR; fallback al accent. */
export function colorOf(key: string | undefined): string {
  if (!key) return colors.accent;
  return OPTCG_COLORS[key]?.color ?? colors.accent;
}

export const fonts = {
  // Sora para displays (números grandes, titulares de carta)
  display: 'Sora_700Bold',
  displayMed: 'Sora_500Medium',
  // Manrope para UI / cuerpo
  ui: 'Manrope_400Regular',
  uiMed: 'Manrope_500Medium',
  uiSemi: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
};

/** Lista de rarezas OPTCG canónicas y orden de "fuerza". */
export const RARITY_ORDER: Record<string, number> = {
  C: 1, UC: 2, R: 3, SR: 4, SEC: 5, L: 6, P: 5, SP: 5, TR: 6,
};

/** Si la rareza es "hot" (SR/L/SEC), se pinta con fondo accent. */
export const HOT_RARITIES = new Set(['SR', 'L', 'SEC', 'SP', 'TR']);

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

/** Escala tipográfica. Sustituye a los fontSize sueltos por todo el código. */
export const type = {
  display: 30,
  h1: 22,
  h2: 18,
  title: 16,
  body: 14,
  label: 13,
  caption: 12,
  micro: 11,
};

/** Sombras/elevación reutilizables (dark theme). */
export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
};

/** Tamaño mínimo de área táctil (Apple HIG / Material). */
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
export const MIN_TOUCH = 44;

/**
 * Opacidad de feedback al pulsar. Úsese en `Pressable`:
 *   style={({ pressed }) => [base, pressed && pressedStyle]}
 * Da la confirmación visual de pulsación que faltaba en toda la app.
 */
export const pressedStyle = { opacity: 0.55 };
/** Variante para superficies grandes (cards): hundimiento sutil. */
export const pressedSurface = { opacity: 0.8 };
