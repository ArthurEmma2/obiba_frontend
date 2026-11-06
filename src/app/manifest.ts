import { withBase } from '@/lib/base-path';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Obiba',
    short_name: 'Obiba',
    description: 'Hold USDC in your own account. Send, receive and pay in Ghana.',
    start_url: withBase('/'),
    scope: withBase('/'),
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: withBase('/brand/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: withBase('/brand/icon-512.png'), sizes: '512x512', type: 'image/png' },
      { src: withBase('/brand/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
