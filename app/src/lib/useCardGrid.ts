// Returns pixel card width and horizontal gap for a given column count,
// computed from the current screen width. Used by every card grid to keep
// the last row left-aligned (avoids the space-between stretch problem).

import { useWindowDimensions } from 'react-native';

const H_PADDING = 18; // px on each side of the grid
const GRID_GAP  = 12; // px between columns

export function useCardGrid(columns: number) {
  const { width } = useWindowDimensions();
  const totalPad  = H_PADDING * 2;
  const totalGap  = GRID_GAP * (columns - 1);
  const cardWidth = Math.floor((width - totalPad - totalGap) / columns);
  return { cardWidth, gap: GRID_GAP, hPadding: H_PADDING };
}
