// Configuración pequeña que el usuario tiene que ajustar a su entorno.
//
// Las imágenes se sirven vía CDN de jsDelivr desde el repo público
// (GITHUB_USER/GITHUB_REPO). La carpeta images/ tiene que estar commiteada y
// pusheada para que jsDelivr la resuelva; si una imagen falla (403/404),
// CachedImage cae automáticamente a `image_source` (sitio oficial).

export const GITHUB_USER = 'Kromm3D';
// Repo público que sirve las imágenes (coincide con el remote `origin`).
export const GITHUB_REPO = 'optcg-tracker';
export const GITHUB_BRANCH = 'main';

/**
 * Reservado para servir imágenes locales en web (app/public/images). Desactivado:
 * la estrategia actual es el CDN. Ver notas en lib/images.ts.
 */
export const USE_LOCAL_IMAGES = false;

/**
 * Estrategia de imágenes:
 *   true  → primary = jsDelivr CDN (.jpg comprimido del repo),
 *           fallback = image_source (sitio oficial).
 *   false → primary = image_source (sitio oficial), sin intentar el CDN.
 *
 * Requisito para true: la carpeta images/ tiene que estar commiteada en el repo
 * público. jsDelivr rechaza repos enormes con 403; si el repo de imágenes supera
 * el límite (~50 MB), usa un repo de imágenes aparte o GitHub Releases y ajusta
 * IMAGE_BASE_URL en consecuencia.
 */
export const CDN_AVAILABLE = true;

/** Base URL del CDN para servir las imágenes del repo. */
export const IMAGE_BASE_URL =
  `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${GITHUB_BRANCH}`;

/** URL base de la búsqueda de Cardmarket para One Piece TCG. */
export const CARDMARKET_BASE = 'https://www.cardmarket.com/en/OnePiece/Products/Search';

// ─── Supabase (cuentas + sync en la nube + amigos) ──────────────────────────
//
// El backend es OPCIONAL: la app funciona 100% offline sin cuenta. Al iniciar
// sesión, la colección/decks/wishlists se respaldan y sincronizan entre
// dispositivos (ver lib/sync.ts), y se habilita el sistema de amigos.
//
// Estos dos valores son PÚBLICOS y seguros de incluir en el bundle: la `anon
// key` es una JWT anónima cuyo acceso está limitado por las políticas RLS del
// proyecto (ver supabase/migrations/0001_init.sql). NUNCA pongas aquí la
// `service_role` key ni el Personal Access Token (`sbp_…`) — esos dan acceso
// total y solo se usan en local/CI para aprovisionar el proyecto.
//
// Rellena estos valores desde el dashboard de Supabase:
//   Project Settings → API → Project URL  y  Project API keys → anon public.
export const SUPABASE_URL = 'https://hphdhozwuvbhduqrwdxn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_09JAOzY-z5arPdqSspfdgg_UOpKb8BI';

/** true cuando hay credenciales configuradas; gatea toda la UI de cuenta/sync. */
export const SUPABASE_ENABLED = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
