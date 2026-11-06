import next from 'eslint-config-next';

const config = [
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...next,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      'no-console': 'error',
      'no-restricted-globals': ['error', { name: 'localStorage', message: 'Use the guarded helpers; never store secrets.' }],
    },
  },
  {
    files: ['src/features/onboarding/totp-deferral.ts', 'src/features/wallet/display-currency.ts', 'tests/**', 'e2e/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
];

export default config;
