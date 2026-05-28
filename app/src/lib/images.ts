// Construye la URL final de una imagen a partir de `image_local` del índice.
// Lo aislamos en un único módulo para poder cambiar la estrategia (CDN,
// raw.githubusercontent, servidor propio) en un solo sitio.

import { IMAGE_BASE_URL } from '../config';

/**
 * Devuelve la URL absoluta de una variante.
 * Ej.: imageUrl("images/OP01/OP01-001.jpg") ->
 *   https://cdn.jsdelivr.net/gh/USUARIO/REPO@main/images/OP01/OP01-001.jpg
 */
export function imageUrl(imageLocal: string): string {
  if (!imageLocal) return '';
  // image_local viene como "images/OP01/OP01-001.jpg" (sin barra inicial).
  const path = imageLocal.startsWith('/') ? imageLocal : '/' + imageLocal;
  return IMAGE_BASE_URL + path;
}
