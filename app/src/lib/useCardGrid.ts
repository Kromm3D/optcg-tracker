// Returns pixel card width and horizontal gap for a given column count,
// computed from the current screen width. Used by every card grid to keep
// the last row left-aligned (avoids the space-between stretch problem).

import { Platform, useWindowDimensions } from 'react-native';
import { MAX_CONTENT_WIDTH } from './layout';

const H_PADDING = 18; // px on each side of the grid
const GRID_GAP  = 12; // px between columns

type GridOpts = {
  /** Override the inter-column gap (default 12). Smaller = tighter grid. */
  gap?: number;
  /** Override the horizontal padding on each side (default 18). */
  hPadding?: number;
};

export function useCardGrid(columns: number, opts: GridOpts = {}) {
  const win = useWindowDimensions().width;
  // En web la app se centra en una columna de ancho máximo (ver lib/layout +
  // App.tsx); el grid se mide contra ese ancho, no contra la ventana entera, o
  // las cartas se calcularían enormes y desbordarían la columna.
  const width = Platform.OS === 'web' ? Math.min(win, MAX_CONTENT_WIDTH) : win;
  const gap       = opts.gap ?? GRID_GAP;
  const hPadding  = opts.hPadding ?? H_PADDING;
  const totalPad  = hPadding * 2;
  const totalGap  = gap * (columns - 1);
  const cardWidth = Math.floor((width - totalPad - totalGap) / columns);
  return { cardWidth, gap, hPadding };
}
