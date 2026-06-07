// Construye URLs para abrir Cardmarket en el navegador.

import { CARDMARKET_BASE } from '../config';
import { getProductUrl } from './prices';

/**
 * URL de búsqueda genérica por código OPTCG (todas las versiones).
 * Ej.: buildCardmarketSearchUrl("OP01-001") ->
 *   https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=OP01-001
 */
export function buildCardmarketSearchUrl(code: string): string {
  const q = encodeURIComponent(code.trim());
  return `${CARDMARKET_BASE}?searchString=${q}`;
}

/**
 * URL específica de una variante concreta.
 * Si prices.json tiene product_url para esa variante, abre la página del
 * producto directamente (arte específico). Si no, cae al buscador genérico.
 */
export function buildCardmarketVariantUrl(code: string, suffix: string = ''): string {
  return getProductUrl(code, suffix) ?? buildCardmarketSearchUrl(code);
}
