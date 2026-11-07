'use client';

import type { ReactNode } from 'react';
import { RouteTransition } from '@/components/route-transition';
import { ServicesProvider } from '@/lib/services';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ServicesProvider>
      {children}
      <RouteTransition />
    </ServicesProvider>
  );
}
