'use client';

import type { ReactNode } from 'react';
import { ServicesProvider } from '@/lib/services';

export function Providers({ children }: { children: ReactNode }) {
  return <ServicesProvider>{children}</ServicesProvider>;
}
