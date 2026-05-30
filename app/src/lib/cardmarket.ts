// Construye URLs para abrir la búsqueda de Cardmarket en el navegador.
//
// La integración con Cardmarket en el MVP es deliberadamente simple:
// no llamamos a su API ni hacemos scraping. Solo abrimos su buscador
// con el código de la carta. Cardmarket suele resolver el código a la
// página del producto correcta o muestra una lista corta de candidatos.

import { CARDMARKET_BASE } from '../config';

/**
 * URL de búsqueda de una carta en Cardmarket por su código OPTCG.
 * Ej.: buildCardmarketSearchUrl("OP01-001") ->
 *   https://www.cardmarket.com/en/OnePiece/Products/Search?searchString=OP01-001
 */
export function buildCardmarketSearchUrl(code: string): string {
  const q = encodeURIComponent(code.trim());
  return `${CARDMARKET_BASE}?searchString=${q}`;
}
