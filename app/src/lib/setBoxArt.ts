// Box art (key art / main visual "mv.webp") por set. El sitio oficial solo
// mantiene viva la página de producto del set vigente — la mayoría de sets
// antiguos nunca tendrán box art. boxArt.json (generado por
// scripts/build_card_database.py) es la lista de los que SÍ lo tienen; el
// resto cae a un fallback temático (ver components/SetBanner.tsx).

import { imageUrl } from './images';

type BoxArtManifest = { sets: string[]; versions?: Record<string, number> };

// @ts-ignore — JSON pequeño, sin necesidad de inferir tipo literal.
import rawManifest from '../data/boxArt.json';

const manifest = rawManifest as BoxArtManifest;
const SETS_WITH_BOX_ART = new Set<string>(manifest.sets ?? []);

export function hasBoxArt(setCode: string): boolean {
  return SETS_WITH_BOX_ART.has(setCode);
}

/** URL del CDN para el box art de un set, o '' si no existe.
 *  Cache-busted con `versions[code]` (timestamp de la última descarga real):
 *  el contenido de "{code}.webp" puede cambiar sin que la URL cambie, y tanto
 *  el navegador como el CDN cachean por URL — sin esto, una imagen actualizada
 *  podría seguir mostrando bytes viejos indefinidamente. */
export function boxArtUrl(setCode: string): string {
  if (!hasBoxArt(setCode)) return '';
  const base = imageUrl(`images/boxart/${setCode}.webp`);
  const version = manifest.versions?.[setCode];
  return version ? `${base}?v=${version}` : base;
}
