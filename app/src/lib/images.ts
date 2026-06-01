// Construye la URL final de una imagen a partir de `image_local` del índice.
// Lo aislamos en un único módulo para poder cambiar la estrategia (CDN,
// raw.githubusercontent, servidor propio) en un solo sitio.

import { IMAGE_BASE_URL, CDN_AVAILABLE } from '../config';
import type { Variant } from '../types';

/**
 * Devuelve la URL del CDN para una ruta local.
 * Ej.: imageUrl("images/OP01/OP01-001.jpg") ->
 *   https://cdn.jsdelivr.net/gh/USUARIO/REPO@main/images/OP01/OP01-001.jpg
 *
 * Si CDN_AVAILABLE=false (repo demasiado grande / no pusheado) devuelve ''
 * para que CachedImage use directamente el fallback image_source.
 */
export function imageUrl(imageLocal: string): string {
  if (!imageLocal || !CDN_AVAILABLE) return '';
  const path = imageLocal.startsWith('/') ? imageLocal : '/' + imageLocal;
  return IMAGE_BASE_URL + path;
}

/**
 * Returns { uri, fallback? } ready to pass to <CachedImage>.
 *
 * CDN available  → uri = jsDelivr URL (fichero .jpg comprimido del repo),
 *                  fallback = image_source (sitio oficial) por si jsDelivr 403/404.
 * CDN blocked    → uri = image_source, no fallback (sitio oficial directo).
 *
 * Cargar primero el .jpg del repo vía CDN evita los PNG pesados del sitio
 * oficial y los fallos de hotlink que hacían que algunas cartas no se vieran.
 */
export function resolveImageUris(v: Pick<Variant, 'image_local' | 'image_source'>): {
  uri: string;
  fallback?: string;
} {
  const cdn = imageUrl(v.image_local);
  if (cdn) return { uri: cdn, fallback: v.image_source || undefined };
  return { uri: v.image_source };
}
