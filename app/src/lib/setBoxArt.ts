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
 *  La versión va en el NOMBRE DE FICHERO (`{code}.{version}.webp`), no en un
 *  query `?v=`. jsDelivr resuelve `@main` a un commit y cachea esa resolución
 *  por región hasta 12h; un `?v=` distinto NO esquiva eso (sirve el mismo
 *  commit cacheado). Un PATH nuevo, en cambio, no existe en ningún caché de
 *  ningún edge ni navegador → fuerza una resolución fresca. Fallback al nombre
 *  plano `{code}.webp` para manifiestos antiguos sin `versions`. */
export function boxArtUrl(setCode: string): string {
  if (!hasBoxArt(setCode)) return '';
  const version = manifest.versions?.[setCode];
  const file = version ? `${setCode}.${version}.webp` : `${setCode}.webp`;
  return imageUrl(`images/boxart/${file}`);
}
