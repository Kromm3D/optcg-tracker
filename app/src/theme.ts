// Theme tokens (colores, tipografias, espacio). Inspirado en el handoff
// de Claude Design pero adaptado a OPTCG: cambiamos las "factions" del
// proto por los 6 colores oficiales de One Piece TCG.

// Paleta "Horo Horo" — ambientada en Perona y sus fantasmas Negative Hollow.
// Dos temas (dos ambientes, cada uno con su propia identidad, no la misma marca
// con el fondo invertido):
//  - DARK  = "Hollow Night": base gótica morada-negra, ROSA Perona como color de
//    marca/acción + CIAN espectral (el aura de los Hollows) como semántico de
//    progreso/colección. Tema por defecto.
//  - LIGHT = "Ghost Day": versión diurna y neblinosa — base lavanda muy clara,
//    rosa oscurecido (rosa profundo) y teal espectral, ambos rebajados para que
//    pasen como texto sobre fondo claro.
// El token `ghost` (cian/teal espectral) es literalmente el aura fantasma: el
// color de "lo que tienes / has completado" en ambos temas. El guiño
// "Horo Horo = Holographic" (rareza holo de TCG) vive en el FOIL iridiscente
// (rosa→lila→cian) reservado a los momentos premium de marca (ver FoilBadge y el
// estado de completado), nunca como decoración suelta.
// El modo se decide UNA VEZ, al arrancar — ver `global.__INITIAL_THEME_MODE__`
// más abajo y `index.js`/`lib/themeMode.ts`: los StyleSheet.create de cada
// pantalla son estáticos (se evalúan una vez al importar), así que cambiar de
// tema en caliente no los refresca — de ahí que cambiar de tema pida reiniciar.

const DARK = {
  bg: '#121012',
  surface: '#1a1a1a',
  surface2: '#262226',
  border: 'rgba(255,246,250,0.12)',
  text: '#fff6fa',
  // Texto secundario (rosa-gris). Pasa AA sobre bg.
  textMut: '#c7b3bd',
  // Texto terciario para códigos/subtítulos/placeholder (≥4:1 sobre bg).
  textDim: '#a2909a',
  // Hot Pink: color de marca/acción. El texto encima va en `onAccent` (Eerie Black).
  accent: '#ff69b4',
  accentDim: 'rgba(255,105,180,0.16)',
  accentGlow: 'rgba(255,105,180,0.40)',
  onAccent: '#1a1a1a',
  // Pink claro: color SEMÁNTICO de progreso/colección (barras, anillos, %).
  // El nombre `ghost` se mantiene por compatibilidad con los componentes.
  ghost: '#ffb6c1',
  ghostDim: 'rgba(255,182,193,0.14)',
  ghostGlow: 'rgba(255,182,193,0.32)',
  onGhost: '#1a1a1a',
  // Rojo de marca: escáner y rarezas altas. Texto/icono encima SIEMPRE en `onRed`
  // (blanco); tinta oscura sobre rojo no pasa contraste.
  red: '#e60012',
  onRed: '#ffffff',
  badge: '#ff69b4',
  ring: 'rgba(255,246,250,0.10)',
  up: '#4ec98b',
  down: '#ff5a68',
  warn: '#e8b04b',
  tabBarWash: 'rgba(38,34,38,0.94)',
};

// Tema claro: base rosada muy clara. Hot Pink y Pink se OSCURECEN (rosa profundo,
// rosa empolvado) porque los tonos de marca no pasan como texto sobre blanco; el
// texto sobre los rellenos se invierte a blanco.
const LIGHT = {
  bg: '#fff5f9',
  surface: '#ffffff',
  surface2: '#fde7f0',
  border: 'rgba(26,26,26,0.12)',
  text: '#1a1a1a',
  textMut: '#5c4a54',
  textDim: '#7a6670',
  accent: '#d1237a',
  accentDim: 'rgba(209,35,122,0.10)',
  accentGlow: 'rgba(209,35,122,0.30)',
  onAccent: '#ffffff',
  ghost: '#b04a68',
  ghostDim: 'rgba(176,74,104,0.12)',
  ghostGlow: 'rgba(176,74,104,0.25)',
  onGhost: '#ffffff',
  red: '#e60012',
  onRed: '#ffffff',
  badge: '#d1237a',
  ring: 'rgba(26,26,26,0.08)',
  up: '#157048',
  down: '#c00a1e',
  warn: '#a86a12',
  tabBarWash: 'rgba(255,255,255,0.94)',
};

export type ThemeMode = 'light' | 'dark';

const initialMode: unknown = (globalThis as { __INITIAL_THEME_MODE__?: unknown }).__INITIAL_THEME_MODE__;

export const themeMode: ThemeMode = initialMode === 'light' ? 'light' : 'dark';

export const colors = themeMode === 'light' ? LIGHT : DARK;

// Tinta para iconos/texto sobre placas SIEMPRE oscuras (el botón "atrás" sobre
// el key art de SetBanner, el menú "..." de DeckRow) — esas placas no cambian
// con el tema (necesitan legibilidad sobre arte de carta, no sobre `bg`), así
// que su tinta tampoco debe derivarse de `colors.text`: en tema Regular eso
// daría texto oscuro sobre una placa oscura. Fija a propósito, en ambos temas.
export const onScrim = '#f6f0fa';

// Foil holográfico ("Horo Horo = Holographic"): degradado iridiscente
// rosa→lila→cian reservado a los momentos premium de marca (rareza holo, estado
// "materializado"). Constante en ambos temas — es un guiño de marca, no un color
// semántico. Lo consume FoilBadge (react-native-svg). `onFoil` = tinta encima.
export const FOIL_STOPS = ['#ff69b4', '#ffd1e6', '#ffffff', '#ffb6c1'];
export const onFoil = '#1a1a1a';

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
  // Bricolage Grotesque para displays (números grandes, titulares de carta)
  display: 'BricolageGrotesque_800ExtraBold',
  displayMed: 'BricolageGrotesque_700Bold',
  // Manrope para UI / cuerpo
  ui: 'Manrope_400Regular',
  uiMed: 'Manrope_500Medium',
  uiSemi: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
};

/** Lista de rarezas OPTCG canónicas y orden de "fuerza". TR no aparece aquí:
 *  es siempre el acabado parallel de una carta cuya rareza real ya es una de
 *  estas seis (ver normalRarityFor en cardDisplay.ts). */
export const RARITY_ORDER: Record<string, number> = {
  C: 1, UC: 2, R: 3, SR: 4, SEC: 5, L: 6, P: 5, SP: 5,
};

/** Si la rareza es "hot" (SR/L/SEC), se pinta con fondo accent. */
export const HOT_RARITIES = new Set(['SR', 'L', 'SEC', 'SP']);

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
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
