// Theme tokens (colores, tipografias, espacio). Inspirado en el handoff
// de Claude Design pero adaptado a OPTCG: cambiamos las "factions" del
// proto por los 6 colores oficiales de One Piece TCG.

export const colors = {
  bg: '#0e0c1a',
  surface: '#151226',
  surface2: '#1e1a30',
  border: 'rgba(236,72,153,0.12)',
  text: '#f4f0ff',
  textMut: '#9d91b8',
  textDim: '#5e5478',
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
