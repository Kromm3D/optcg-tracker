// currency.ts — presentación de importes en la divisa elegida por el usuario.
//
// El catálogo de precios (data/prices.json) se scrapea de Cardmarket y está
// SIEMPRE en EUR: esa es la divisa base interna. Todo lo que se guarda en
// disco (coste base, precios objetivo de alerta) se guarda también en EUR.
// Este módulo es la única capa que traduce EUR → divisa de presentación.
//
// Las tasas son ESTÁTICAS y aproximadas: no hay un feed de FX en la app y
// añadir uno por una etiqueta de precio no compensa. Es lo bastante bueno
// para orientarse y está declarado como tal en la UI (settings.fxDisclaimer).

import { getSettings, type CurrencyCode } from './settings';

interface CurrencyDef {
  /** Símbolo antepuesto al importe. */
  symbol: string;
  /** Cuántas unidades de esta divisa vale 1 EUR. */
  perEur: number;
  /** Decimales a mostrar por defecto (el yen no usa céntimos). */
  decimals: 0 | 2;
}

/** Tasas de referencia, actualizadas a mano (última revisión: 2026-08-02). */
export const CURRENCIES: Record<CurrencyCode, CurrencyDef> = {
  EUR: { symbol: '€',  perEur: 1,      decimals: 2 },
  USD: { symbol: '$',  perEur: 1.09,   decimals: 2 },
  GBP: { symbol: '£',  perEur: 0.85,   decimals: 2 },
  JPY: { symbol: '¥',  perEur: 168,    decimals: 0 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

function active(): CurrencyDef {
  return CURRENCIES[getSettings().currency] ?? CURRENCIES.EUR;
}

/** Símbolo de la divisa activa — para etiquetas sueltas ("Precio (€)"). */
export function currencySymbol(): string {
  return active().symbol;
}

/** Convierte un importe en EUR a la divisa activa (sin formatear). */
export function fromEur(eur: number): number {
  return eur * active().perEur;
}

/** Convierte un importe en la divisa activa de vuelta a EUR, para guardarlo. */
export function toEur(amount: number): number {
  return amount / active().perEur;
}

/**
 * Formatea un importe **dado en EUR** para mostrarlo.
 *
 * - `compact`: por encima de 100 se redondea a entero (los céntimos son ruido
 *   en un total de vault de cuatro cifras).
 * - `grouped`: separador de millares.
 * - `signed`: antepone + o − (para deltas de P&L).
 */
export function formatEur(
  eur: number,
  opts: { compact?: boolean; grouped?: boolean; signed?: boolean } = {},
): string {
  const { symbol, perEur, decimals } = active();
  const value = eur * perEur;
  const abs = Math.abs(value);
  const dec = opts.compact && abs >= 100 ? 0 : decimals;
  let body = abs.toFixed(dec);
  if (opts.grouped) {
    const [int, frac] = body.split('.');
    body = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
  }
  const sign = opts.signed ? (value < 0 ? '−' : '+') : value < 0 ? '−' : '';
  return `${sign}${symbol}${body}`;
}
