import { withBase } from '@/lib/base-path';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Obiba', template: '%s | Obiba' },
  description: 'Hold USDC in your own account. Send, receive and pay in Ghana.',
  applicationName: 'Obiba',
  appleWebApp: { capable: true, title: 'Obiba', statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false, address: false },
  icons: { icon: withBase('/brand/favicon.png'), apple: withBase('/brand/apple-touch-icon.png') },
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
