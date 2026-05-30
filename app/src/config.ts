// Configuración pequeña que el usuario tiene que ajustar a su entorno.
//
// Cuando subas el repo a GitHub, rellena GITHUB_USER y GITHUB_REPO con
// tu usuario y nombre de repo. La app construirá las URLs de las imágenes
// a través del CDN de jsDelivr, como describe el README de la raíz.
//
// Mientras estés desarrollando con `expo start` sin haber subido nada,
// deja USE_LOCAL_IMAGES = true: la app intentará cargar las imágenes
// desde el bundle local (no funciona en dispositivo real, sí en web).

export const GITHUB_USER = 'Kromm3D';
export const GITHUB_REPO = 'optcg-tracker';
export const GITHUB_BRANCH = 'main';

/** Si true, intenta resolver imágenes localmente (útil solo para web/dev). */
export const USE_LOCAL_IMAGES = false;

/**
 * jsDelivr blocks repos > ~50 MB with 403. Set to false until the compressed
 * images are committed and pushed (repo is currently untracked / ~404 MB).
 * When true: primary = jsDelivr CDN, fallback = image_source (official site).
 * When false: primary = image_source (official site), no CDN attempt.
 */
export const CDN_AVAILABLE = false;

/** Base URL del CDN para servir las imágenes del repo. */
export const IMAGE_BASE_URL =
  `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${GITHUB_BRANCH}`;

/** URL base de la búsqueda de Cardmarket para One Piece TCG. */
export const CARDMARKET_BASE = 'https://www.cardmarket.com/en/OnePiece/Products/Search';
