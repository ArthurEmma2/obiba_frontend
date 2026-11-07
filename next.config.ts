import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  productionBrowserSourceMaps: false,
  images: { unoptimized: true },
  pageExtensions: isDev ? ['tsx', 'ts', 'preview.tsx'] : ['tsx', 'ts'],
};

export default config;
