// Box art (key art / main visual "mv.webp") por set. El sitio oficial solo
// mantiene viva la página de producto del set vigente — la mayoría de sets
// antiguos nunca tendrán box art. boxArt.json (generado por
// scripts/build_card_database.py) es la lista de los que SÍ lo tienen; el
// resto cae a un fallback temático (ver components/SetBanner.tsx).

import { imageUrl } from './images';

// @ts-ignore — JSON pequeño, sin necesidad de inferir tipo literal.
import rawManifest from '../data/boxArt.json';

const SETS_WITH_BOX_ART = new Set<string>((rawManifest as { sets: string[] }).sets ?? []);

export function hasBoxArt(setCode: string): boolean {
  return SETS_WITH_BOX_ART.has(setCode);
}

/** URL del CDN para el box art de un set, o '' si no existe. */
export function boxArtUrl(setCode: string): string {
  if (!hasBoxArt(setCode)) return '';
  return imageUrl(`images/boxart/${setCode}.webp`);
}
