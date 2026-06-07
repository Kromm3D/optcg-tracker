/**
 * scrape_browser_console.js
 * ─────────────────────────
 * Pegar este script en la consola de Chrome DevTools mientras estás en
 * https://www.cardmarket.com/en/OnePiece/Products/Singles/<CUALQUIER_EXPANSION>
 *
 * El script navega automáticamente por todas las páginas de esa expansión,
 * extrae código y precio "From" del DOM (sin fetch adicional), y al final
 * muestra un JSON que puedes copiar y pasar a import_browser_prices.py.
 *
 * INSTRUCCIONES:
 *   1. Abre Chrome y ve a la página de singles de una expansión, p.ej.:
 *      https://www.cardmarket.com/en/OnePiece/Products/Singles/Heroines-Edition
 *   2. Abre DevTools (F12) → pestaña Console.
 *   3. Pega TODO este script y pulsa Enter.
 *   4. Espera a que termine (verás "DONE" en la consola).
 *   5. Copia el JSON resultante y guárdalo como data/browser_dump.json.
 *   6. Ejecuta: python scripts/import_browser_prices.py
 *
 * Para scrapear varias expansiones, repite desde el paso 1 en cada una.
 * El script acumula resultados en window.__CM_PRICES y el JSON final
 * siempre incluye todo lo recogido hasta el momento.
 */

(async function scrapeCardmarket() {
  const DELAY_MS = 2500;      // ms entre navegaciones de página
  const SLUG_RE  = /([A-Z]{1,4}\d{2}-\d{3})-V(\d+)/;

  function parsePrice(text) {
    const m = text && text.match(/(\d{1,4}[.,]\d{2})\s*€/);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }

  function versionToSuffix(v) {
    const n = parseInt(v);
    return n <= 1 ? '' : '_p' + (n - 1);
  }

  function extractSlug() {
    const m = location.pathname.match(/\/Products\/Singles\/([^/?]+)/);
    return m ? m[1] : null;
  }

  function extractPageData(slug) {
    const results = {};
    const selector = `a[href*="/Products/Singles/${slug}/"]`;
    const links = [...document.querySelectorAll(selector)]
      .filter(a => SLUG_RE.test(a.href.split('/').pop().split('?')[0]));

    for (const a of links) {
      const part = a.href.split(`/Singles/${slug}/`)[1]?.split('?')[0] || '';
      const m = SLUG_RE.exec(part);
      if (!m) continue;

      const code   = m[1];
      const suffix = versionToSuffix(m[2]);
      const key    = code + suffix;

      let low = null;
      let el  = a.parentElement;
      for (let i = 0; i < 8 && el; i++) {
        low = parsePrice(el.innerText);
        if (low !== null) break;
        el = el.parentElement;
      }

      results[key] = {
        low,
        trend:       null,
        product_url: a.href.split('?')[0],
        updated:     new Date().toISOString().slice(0, 10),
      };
    }
    return results;
  }

  function hasNextPage() {
    return !!document.querySelector('a[aria-label="Next page"]');
  }

  function navigateToNextPage() {
    const next = document.querySelector('a[aria-label="Next page"]');
    if (next) next.click();
  }

  function getCurrentPage() {
    const m = location.search.match(/[?&]site=(\d+)/);
    return m ? parseInt(m[1]) : 1;
  }

  // ── Inicializar acumulador global ────────────────────────────────────────
  window.__CM_PRICES = window.__CM_PRICES || {};

  const slug = extractSlug();
  if (!slug) {
    console.error('[CM] No se detectó expansión en la URL actual.');
    console.error('     Asegúrate de estar en /Products/Singles/<SLUG>');
    return;
  }

  console.log(`[CM] Expansión detectada: ${slug}`);
  console.log('[CM] Iniciando extracción — NO cierres esta pestaña...');

  let page = getCurrentPage();

  // ── Loop de páginas ──────────────────────────────────────────────────────
  while (true) {
    const pageData = extractPageData(slug);
    Object.assign(window.__CM_PRICES, pageData);
    console.log(`  Pág ${page}: ${Object.keys(pageData).length} cartas (total: ${Object.keys(window.__CM_PRICES).length})`);

    if (!hasNextPage()) {
      console.log('[CM] Última página alcanzada.');
      break;
    }

    navigateToNextPage();
    page++;

    // Esperar a que cargue la nueva página
    await new Promise(resolve => {
      const startUrl = location.href;
      const check = setInterval(() => {
        if (location.href !== startUrl) {
          clearInterval(check);
          // Esperar renderizado completo
          setTimeout(resolve, DELAY_MS);
        }
      }, 200);
    });
  }

  // ── Generar JSON ─────────────────────────────────────────────────────────
  const output = {
    generated: new Date().toISOString(),
    source:    'cardmarket.com/en/OnePiece (browser console)',
    currency:  'EUR',
    fetched:   Object.keys(window.__CM_PRICES).length,
    prices:    window.__CM_PRICES,
  };

  const json = JSON.stringify(output, null, 2);

  // Mostrar en consola y ofrecer descarga
  console.log('\n[CM] ══ DONE ══');
  console.log(`[CM] ${output.fetched} entradas recogidas de "${slug}"`);
  console.log('[CM] Descargando browser_dump.json...');

  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'browser_dump.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('[CM] Fichero descargado. Cópialo a data/browser_dump.json');
  console.log('[CM] Luego ejecuta:  python scripts/import_browser_prices.py');

  return output;
})();
