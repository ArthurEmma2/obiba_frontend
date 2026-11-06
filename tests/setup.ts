import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
process.env.NEXT_PUBLIC_ACCOUNT_SUFFIX = '.obiba.near';
process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test/graphql';
process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://app.example.test';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'obiba-test';
process.env.NEXT_PUBLIC_PAY_CONTRACT = 'pay.obiba.near';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
(globalThis as { testRouter?: typeof router }).testRouter = router;

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
    });
  }
  window.scrollTo = () => undefined;
}

afterEach(() => {
  cleanup();
  router.replace.mockReset();
  router.push.mockReset();
});
