function read(name: string, value: string | undefined, fallback?: string): string {
  const v = value ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing configuration: ${name}`);
  return v;
}

export interface WebConfig {
  firebase: { apiKey: string; authDomain: string; projectId: string; tenantId: string | null };
  apiUrl: string;
  sendQueryText: boolean;
  nearNetwork: 'mainnet' | 'testnet' | 'sandbox';
  accountParent: string;
  siteUrl: string;
  supportEmail: string;
  appOrigin: string;
  authEmulatorUrl: string | null;
  payContract: string;
  nearRpcUrl: string | null;
  skipOtp: boolean;
  turnstileSiteKey: string | null;
  uiPreview: boolean;
}

let cached: WebConfig | null = null;

export function webConfig(): WebConfig {
  if (cached) return cached;
  const network = read('NEXT_PUBLIC_NEAR_NETWORK', process.env.NEXT_PUBLIC_NEAR_NETWORK);
  if (network !== 'mainnet' && network !== 'testnet' && network !== 'sandbox') throw new Error('Invalid NEXT_PUBLIC_NEAR_NETWORK');
  const suffix = read('NEXT_PUBLIC_ACCOUNT_SUFFIX', process.env.NEXT_PUBLIC_ACCOUNT_SUFFIX);
  if (!/^\.[a-z0-9.-]+$/.test(suffix)) throw new Error('Invalid NEXT_PUBLIC_ACCOUNT_SUFFIX');
  cached = {
    firebase: {
      apiKey: read('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      authDomain: read('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
      projectId: read('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      tenantId: process.env.NEXT_PUBLIC_IDP_TENANT_ID || null,
    },
    apiUrl: read('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
    sendQueryText: process.env.NEXT_PUBLIC_GRAPHQL_SEND_QUERY === '1',
    nearNetwork: network,
    accountParent: suffix.slice(1),
    siteUrl: read('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL, 'https://www.obibajk.com'),
    supportEmail: read('NEXT_PUBLIC_SUPPORT_EMAIL', process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 'hello@obibajk.com'),
    appOrigin: read('NEXT_PUBLIC_APP_ORIGIN', process.env.NEXT_PUBLIC_APP_ORIGIN),
    authEmulatorUrl: process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL || null,
    payContract: read('NEXT_PUBLIC_PAY_CONTRACT', process.env.NEXT_PUBLIC_PAY_CONTRACT),
    skipOtp: process.env.NEXT_PUBLIC_SKIP_OTP === '1',
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    uiPreview: process.env.NEXT_PUBLIC_UI_PREVIEW === '1',
    nearRpcUrl: process.env.NEXT_PUBLIC_NEAR_RPC_URL || (network === 'mainnet' ? 'https://free.rpc.fastnear.com' : network === 'testnet' ? 'https://test.rpc.fastnear.com' : null),
  };
  if (cached.skipOtp && network === 'mainnet') throw new Error('NEXT_PUBLIC_SKIP_OTP is not allowed on mainnet');
  if (process.env.NODE_ENV === 'production' && cached.sendQueryText) throw new Error('Production builds must send persisted operation hashes only');
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}
