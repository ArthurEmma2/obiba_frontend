import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScanPay } from '@/features/wallet/pay';

export const metadata: Metadata = { title: 'Scan to pay' };

export default function Page() {
  return (
    <Suspense>
      <ScanPay />
    </Suspense>
  );
}
