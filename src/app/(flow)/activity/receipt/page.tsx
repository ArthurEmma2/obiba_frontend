import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReceiptRoute } from '@/features/wallet/records';

export const metadata: Metadata = { title: 'Receipt' };

export default function Page() {
  return (
    <Suspense>
      <ReceiptRoute />
    </Suspense>
  );
}
