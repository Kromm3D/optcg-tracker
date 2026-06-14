// Iconos SVG inline. Mismo set que el handoff (24x24, stroke-based).

import React from 'react';
import Svg, { Path } from 'react-native-svg';

const ICON_PATHS: Record<string, string> = {
  home:    'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  grid:    'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers:  'M12 3 2 8.5 12 14l10-5.5L12 3ZM2 15.5 12 21l10-5.5M2 12 12 17.5 22 12',
  swap:    'M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8',
  binder:  'M5 3h12a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2ZM9 7h6',
  search:  'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  filter:  'M3 5h18M6 12h12M10 19h4',
  plus:    'M12 5v14M5 12h14',
  minus:   'M5 12h14',
  heart:   'M12 20.5 4.5 13a4.5 4.5 0 0 1 6.4-6.3l1.1 1 1.1-1A4.5 4.5 0 0 1 19.5 13Z',
  star:    'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 20.6l1-5.8-4.3-4.1 5.9-.9Z',
  chevR:   'M9 6l6 6-6 6',
  chevL:   'M15 6l-6 6 6 6',
  chevD:   'M6 9l6 6 6-6',
  close:   'M6 6l12 12M18 6 6 18',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDn: 'M12 5v14M6 13l6 6 6-6',
  bolt:    'M13 3 4 14h6l-1 7 9-11h-6z',
  trend:   'M3 17l5-5 4 4 8-8M16 8h5v5',
  scan:    'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  cart:    'M3 4h2l2.4 12.4a1 1 0 0 0 1 .6h8.2a1 1 0 0 0 1-.8L20 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  check:   'M5 12.5 10 17.5 19.5 7',
  dots:    'M5 12h.01M12 12h.01M19 12h.01',
  user:    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21a7 7 0 0 1 14 0',
  bell:    'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 21h4',
  tag:     'M3 12 12 3h7a2 2 0 0 1 2 2v7l-9 9-9-9ZM16.5 8.5h.01',
  external:'M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  gear:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
};

export interface IconProps {
  name: keyof typeof ICON_PATHS | string;
  size?: number;
  color?: string;
  stroke?: number;
}

export function Icon({ name, size = 22, color = 'currentColor', stroke = 1.8 }: IconProps) {
  const d = ICON_PATHS[name] || '';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
