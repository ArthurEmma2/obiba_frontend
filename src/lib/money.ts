export const USDC_DECIMALS = 6;

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function splitUnits(units: string | bigint, decimals = USDC_DECIMALS, shown = 2): { negative: boolean; whole: string; fraction: string } {
  let v = typeof units === 'bigint' ? units : BigInt(units);
  const negative = v < 0n;
  if (negative) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').slice(0, shown);
  return { negative, whole: group(whole.toString()), fraction: frac };
}

export function formatUsd(units: string | bigint, opts: { decimals?: number; exact?: boolean } = {}): string {
  const decimals = opts.decimals ?? USDC_DECIMALS;
  if (!opts.exact) {
    const { negative, whole, fraction } = splitUnits(units, decimals, 2);
    return `${negative ? '-' : ''}$${whole}.${fraction}`;
  }
  const { negative, whole, fraction } = splitUnits(units, decimals, decimals);
  const trimmed = fraction.replace(/0+$/, '').padEnd(2, '0');
  return `${negative ? '-' : ''}$${whole}.${trimmed}`;
}

export function parseAmount(input: string, decimals = USDC_DECIMALS): bigint | null {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d{1,15})(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  const v = BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return v;
}

export function unitsToInput(units: bigint, decimals = USDC_DECIMALS): string {
  const base = 10n ** BigInt(decimals);
  const frac = (units % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${units / base}.${frac}` : `${units / base}`;
}

export const CEDI = `GH${String.fromCharCode(0x20b5)}`;

export function toPesewas(units: string | bigint, ratePerUsd: string, decimals = USDC_DECIMALS): bigint | null {
  const m = /^(\d{1,6})(?:\.(\d+))?$/.exec(ratePerUsd);
  if (!m) return null;
  const rateScaled = BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? '').slice(0, 6).padEnd(6, '0'));
  return (BigInt(units) * rateScaled * 100n) / (10n ** BigInt(decimals) * 1_000_000n);
}

export function splitPesewas(pesewas: bigint): { whole: string; fraction: string } {
  return { whole: group((pesewas / 100n).toString()), fraction: (pesewas % 100n).toString().padStart(2, '0') };
}

export function formatLocal(units: string, ratePerUsd: string, decimals = USDC_DECIMALS): string {
  const pesewas = toPesewas(units, ratePerUsd, decimals);
  if (pesewas === null) return '';
  const { whole, fraction } = splitPesewas(pesewas);
  return `${CEDI} ${whole}.${fraction}`;
}

export const CURRENCY_SYMBOLS: Record<string, string> = { GHS: CEDI, KES: 'KSh', NGN: String.fromCharCode(0x20a6), ZAR: 'R' };

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export function formatMoney(amount: string, currency: string): string {
  const symbol = currencySymbol(currency);
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!m) return `${symbol} ${amount}`;
  return `${symbol} ${group(m[1]!)}.${(m[2] ?? '').padEnd(2, '0')}`;
}

export function formatGhs(amount: string): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!m) return `${CEDI} ${amount}`;
  return `${CEDI} ${group(m[1]!)}.${(m[2] ?? '').padEnd(2, '0')}`;
}

export function formatRate(rate: string): string {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!m) return rate;
  return `${m[1]}.${(m[2] ?? '').slice(0, 2).padEnd(2, '0')}`;
}
