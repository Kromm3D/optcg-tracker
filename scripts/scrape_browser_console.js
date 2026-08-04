/**
 * scrape_browser_console.js
 * ─────────────────────────
 * Pegar este script en la consola de Chrome DevTools mientras estás en
 * https://www.cardmarket.com/en/OnePiece/Products/Singles/<CUALQUIER_EXPANSION>
 *
 * FASE 1 (automática al pegar el script) — recorre el listado de esa
 * expansión, extrae código y product_url de cada carta, y hace un intento de
 * precio "From" leyendo el texto alrededor del link (rápido: una carga de
 * página cubre 20-30 cartas, pero es un heurístico y a veces no encuentra
 * nada — ver más abajo).
 *
 * FASE 2 (opcional, manual: `await __cmRefine()`) — para las cartas que
 * quedaron sin precio en la fase 1, visita la página de producto de cada una
 * (con fetch(), reusando la sesión/cookies de esta pestaña — no dispara el
 * challenge de Cloudflare porque ya lo pasaste al cargar esta página) y lee
 * el precio del `<dl>` de info-list-container, que es una lista de pares
 * etiqueta/valor ("From", "Trend"...) mucho más fiable que adivinar por
 * proximidad. Esta técnica viene de cardmarket_parser.py en
 * https://github.com/DrankRock/AutoScrape — la parte reutilizable de ese
 * proyecto no es su bypass de Cloudflare (eso depende de la reputación de tu
 * IP, no del código), es este selector.
 *
 * INSTRUCCIONES:
 *   1. Abre Chrome y ve a la página de singles de una expansión, p.ej.:
 *      https://www.cardmarket.com/en/OnePiece/Products/Singles/Heroines-Edition
 *   2. Abre DevTools (F12) → pestaña Console.
 *   3. Pega TODO este script y pulsa Enter. Espera a "FASE 1 · DONE".
 *   4. (Opcional, recomendado) Ejecuta:  await __cmRefine()
 *      Tarda más (una carga de página por carta pendiente) pero rellena los
 *      huecos y añade `trend` (tendencia de precio), que la fase 1 nunca captura.
 *   5. Ejecuta:  __cmDownload()   ← descarga browser_dump.json con todo lo
 *      acumulado hasta ese momento (puedes llamarla en cualquier punto).
 *   6. Copia el fichero descargado a data/browser_dump.json.
 *   7. Ejecuta: python scripts/import_browser_prices.py
 *
 * Para scrapear varias expansiones, repite desde el paso 1 en cada una — los
 * resultados se acumulan en window.__CM_PRICES entre navegaciones dentro de
 * la misma pestaña (se pierden si recargas o cierras la pestaña).
 */

(async function scrapeCardmarket() {
  const DELAY_MS        = 2500; // ms entre navegaciones de página (fase 1)
  const REFINE_DELAY_MS = 700;  // ms entre fetch() de producto (fase 2)
  const SLUG_RE  = /([A-Z]{1,4}\d{2}-\d{3})-V(\d+)/;

  // Cardmarket usa el formato del locale de la sesion, asi que hay que tragar
  // "1.234,56 €" y "1,234.56 €". El patron captura el numero con todos sus
  // separadores y la normalizacion decide cual es el decimal: el ultimo
  // separador seguido de exactamente dos digitos; el resto son millares.
  function parsePrice(text) {
    const m = text && text.match(/(\d[\d.,  ]*\d)\s*€/);
    if (!m) return null;
    const raw = m[1].replace(/[  ]/g, '');
    const cut = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
    const tail = cut === -1 ? '' : raw.slice(cut + 1);
    const value = (cut !== -1 && tail.length === 2)
      ? `${raw.slice(0, cut).replace(/[.,]/g, '') || '0'}.${tail}`
      : raw.replace(/[.,]/g, '');
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
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

      // Se sube buscando el precio, pero parando en cuanto el ancestro abarca
      // mas de un producto: sin ese freno, una carta sin precio se lleva el de
      // otra fila (al subir lo suficiente se llega al listado entero y el
      // regex engancha el primer importe que vea).
      let low = null;
      let el  = a.parentElement;
      for (let i = 0; i < 8 && el && el !== document.body; i++) {
        if (el.querySelectorAll('a[href*="/Products/Singles/"]').length > 1) break;
        low = parsePrice(el.innerText);
        if (low !== null) break;
        el = el.parentElement;
      }

      results[key] = {
        low,
        trend:       window.__CM_PRICES?.[key]?.trend ?? null,
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

  // ── Fase 2: precio de una página de producto individual ────────────────
  // Estructura tomada de cardmarket_parser.py (AutoScrape): un <dl> dentro de
  // .info-list-container con pares <dt>etiqueta</dt><dd>valor</dd>. Mucho más
  // fiable que el heurístico de "subir ancestros" de extractPageData, pero
  // cuesta una carga de página por carta — por eso es una fase aparte y
  // opcional, no el paso por defecto.
  function parseProductPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const dl = doc.querySelector('.info-list-container dl');
    if (!dl) return { low: null, trend: null };

    const dts = [...dl.querySelectorAll('dt')];
    const dds = [...dl.querySelectorAll('dd')];
    let low = null, trend = null;

    for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
      const label = dts[i].textContent.trim().toLowerCase();
      const valueText = (dds[i].querySelector('span')?.textContent ?? dds[i].textContent).trim();

      // "From" en varios idiomas por si la sesión no está en inglés.
      if (low === null && ['from', 'de', 'ab', 'à partir de'].includes(label)) {
        low = parsePrice(valueText);
      }
      if (trend === null && (label.includes('trend') || label.includes('tendance') || label.includes('tendenz'))) {
        trend = parsePrice(valueText);
      }
    }
    return { low, trend };
  }

  async function __cmRefine({ onlyMissing = true, limit = Infinity } = {}) {
    if (!window.__CM_PRICES) {
      console.error('[CM] No hay nada que refinar todavía — corre primero la fase 1 (pega el script en una página de listado).');
      return;
    }
    const entries = Object.entries(window.__CM_PRICES)
      .filter(([, v]) => v.product_url && (!onlyMissing || v.low == null))
      .slice(0, limit);

    if (entries.length === 0) {
      console.log('[CM] Nada que refinar (todas las cartas ya tienen precio, o no hay product_url).');
      return;
    }

    console.log(`[CM] Fase 2: refinando ${entries.length} carta(s) via página de producto...`);
    let fixed = 0;
    for (let i = 0; i < entries.length; i++) {
      const [key, entry] = entries[i];
      try {
        const resp = await fetch(entry.product_url, { credentials: 'same-origin' });
        if (resp.ok) {
          const html = await resp.text();
          const { low, trend } = parseProductPage(html);
          if (low !== null) entry.low = low;
          if (trend !== null) entry.trend = trend;
          if (low !== null || trend !== null) fixed++;
        } else {
          console.warn(`  [${i + 1}/${entries.length}] ${key}: HTTP ${resp.status}`);
        }
      } catch (e) {
        console.warn(`  [${i + 1}/${entries.length}] ${key}: ${e}`);
      }
      if (i % 10 === 0 || i === entries.length - 1) {
        console.log(`  [${i + 1}/${entries.length}] ${key} — ${fixed} arregladas hasta ahora`);
      }
      await new Promise(r => setTimeout(r, REFINE_DELAY_MS));
    }
    console.log(`[CM] Fase 2 completa: ${fixed}/${entries.length} cartas obtuvieron precio nuevo.`);
    console.log('[CM] Llama a __cmDownload() para descargar el resultado actualizado.');
  }

  function __cmDownload() {
    const output = {
      generated: new Date().toISOString(),
      source:    'cardmarket.com/en/OnePiece (browser console)',
      currency:  'EUR',
      fetched:   Object.keys(window.__CM_PRICES || {}).length,
      prices:    window.__CM_PRICES || {},
    };
    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'browser_dump.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[CM] Descargado browser_dump.json (${output.fetched} entradas). Cópialo a data/browser_dump.json`);
    console.log('[CM] Luego ejecuta:  python scripts/import_browser_prices.py');
    return output;
  }

  // Exponer las funciones de fase 2 para llamarlas a mano tras la fase 1.
  window.__cmRefine   = __cmRefine;
  window.__cmDownload = __cmDownload;

  // ── Inicializar acumulador global ────────────────────────────────────────
  window.__CM_PRICES = window.__CM_PRICES || {};

  const slug = extractSlug();
  if (!slug) {
    console.error('[CM] No se detectó expansión en la URL actual.');
    console.error('     Asegúrate de estar en /Products/Singles/<SLUG>');
    return;
  }

  console.log(`[CM] Expansión detectada: ${slug}`);
  console.log('[CM] Iniciando extracción (fase 1) — NO cierres esta pestaña...');

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

  const missing = Object.values(window.__CM_PRICES).filter(v => v.low == null).length;
  console.log(`\n[CM] ══ FASE 1 · DONE ══`);
  console.log(`[CM] ${Object.keys(window.__CM_PRICES).length} entradas recogidas de "${slug}" (${missing} sin precio)`);
  if (missing > 0) {
    console.log(`[CM] Para intentar rellenar esas ${missing}:  await __cmRefine()`);
  }
  console.log('[CM] Para descargar el JSON ahora mismo:  __cmDownload()');
})();
