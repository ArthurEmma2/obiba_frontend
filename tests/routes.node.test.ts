import { describe, expect, it, vi } from 'vitest';
import { canonicalRoute, routes } from '@/lib/routes';

const INVOICE = '0123456789abcdef0123456789abcdef';

describe('path-style links on a static host', () => {
  it('keeps the payment links the API issues working', () => {
    expect(canonicalRoute(`/pay/${INVOICE}`, '')).toBe(routes.invoice(INVOICE));
    expect(canonicalRoute(`/pay/${INVOICE}/`, '?payment=p1')).toBe(routes.invoice(INVOICE, 'p1'));
  });

  it('maps record links to their query routes', () => {
    expect(canonicalRoute('/activity/op1', '')).toBe('/activity/detail?id=op1');
    expect(canonicalRoute('/activity/op1/receipt', '')).toBe('/activity/receipt?id=op1');
    expect(canonicalRoute('/add/crypto/d1', '')).toBe('/add/crypto/track?id=d1');
    expect(canonicalRoute('/withdraw/w1', '')).toBe('/withdraw/track?id=w1');
  });

  it('leaves unknown paths and non-invoice pay links as not found', () => {
    expect(canonicalRoute('/nope', '')).toBeNull();
    expect(canonicalRoute('/pay/not-an-invoice', '')).toBeNull();
    expect(canonicalRoute('/a/b/c/d', '')).toBeNull();
  });

  it('forwards links that arrive with a base path', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/obiba_frontend');
    vi.resetModules();
    const based = await import('@/lib/routes');
    expect(based.canonicalRoute(`/obiba_frontend/pay/${INVOICE}`, '')).toBe(based.routes.invoice(INVOICE));
    expect(based.canonicalRoute('/obiba_frontend/nope', '')).toBeNull();
    vi.unstubAllEnvs();
  });
});
