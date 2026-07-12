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
  bg: '#131019',
  surface: '#1c1726',
  surface2: '#261f33',
  border: 'rgba(246,240,250,0.10)',
  text: '#f6f0fa',
  // Secondary text (lavanda). ~5:1 sobre bg — pasa WCAG AA para texto normal.
  textMut: '#a99bba',
  // Texto terciario (~4:1 sobre bg) para códigos/subtítulos/placeholder.
  // Nunca usar para etiquetas de navegación o texto <14px crítico.
  textDim: '#8a7ca0',
  // Rosa Perona (candy-gótico): color de marca/acción de ESTE tema. Sobre fondo
  // oscuro un rosa claro basta; el texto encima va en `onAccent` (tinta ciruela
  // oscura). Deliberadamente distinto del dot de carta "Morado" (#9b5de5).
  accent: '#ff6fb5',
  accentDim: 'rgba(255,111,181,0.14)',
  accentGlow: 'rgba(255,111,181,0.38)',
  onAccent: '#3d1228',
  // Cian espectral del aura Negative Hollow: color SEMÁNTICO de progreso/colección
  // (barras, anillos, %, "materializado"), constante en ambos temas. Distinto del
  // dot de carta "Azul" (#4a90e2) para no confundirlos.
  ghost: '#9fe3e8',
  ghostDim: 'rgba(159,227,232,0.14)',
  ghostGlow: 'rgba(159,227,232,0.32)',
  onGhost: '#0c3b3e',
  badge: '#ff6fb5',
  // Pista neutra del ProgressRing — blanco lavanda translúcido.
  ring: 'rgba(246,240,250,0.08)',
  up: '#4ec98b',
  down: '#ef5d6b',
  // Wash translúcido de la barra flotante de tabs — un valor propio porque
  // necesita transparencia (no puede derivarse de `surface2`, que es sólido).
  tabBarWash: 'rgba(28,23,38,0.94)',
};

// Tema "Ghost Day": Perona de día, neblinoso. Base lavanda muy clara. El rosa de
// marca y el cian espectral se OSCURECEN aquí (rosa→rosa profundo, cian→teal
// profundo) porque los tonos claros del tema oscuro no pasan ~4.5:1 como texto
// sobre fondo claro. Por eso mismo el texto ENCIMA de los rellenos se invierte a
// blanco (`onAccent`/`onGhost`): con accent/ghost ya oscurecidos, tinta oscura
// encima perdería contraste. up/down se oscurecen por la misma razón (se usan
// como texto directo, p.ej. el delta del vault y el % de cambio de precio).
const LIGHT = {
  bg: '#f4eef9',
  surface: '#ffffff',
  surface2: '#efe7f6',
  border: 'rgba(45,26,58,0.14)',
  text: '#241a2e',
  textMut: '#5e5170',
  textDim: '#766888',
  accent: '#c0357a',
  accentDim: 'rgba(192,53,122,0.10)',
  accentGlow: 'rgba(192,53,122,0.30)',
  onAccent: '#ffffff',
  ghost: '#0f8390',
  ghostDim: 'rgba(15,131,144,0.12)',
  ghostGlow: 'rgba(15,131,144,0.25)',
  onGhost: '#ffffff',
  badge: '#c0357a',
  ring: 'rgba(45,26,58,0.08)',
  up: '#157048',
  down: '#c0334a',
  tabBarWash: 'rgba(255,255,255,0.92)',
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
export const FOIL_STOPS = ['#ff6fb5', '#c79cf0', '#9fe3e8', '#ffb3d9'];
export const onFoil = '#3d1228';

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

/** Lista de rarezas OPTCG canónicas y orden de "fuerza". TR no aparece aquí:
 *  es siempre el acabado parallel de una carta cuya rareza real ya es una de
 *  estas seis (ver normalRarityFor en cardDisplay.ts). */
export const RARITY_ORDER: Record<string, number> = {
  C: 1, UC: 2, R: 3, SR: 4, SEC: 5, L: 6, P: 5, SP: 5,
};

/** Si la rareza es "hot" (SR/L/SEC), se pinta con fondo accent. */
export const HOT_RARITIES = new Set(['SR', 'L', 'SEC', 'SP']);

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
