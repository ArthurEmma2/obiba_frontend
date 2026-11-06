import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TransactionDetailRoute } from '@/features/wallet/records';

export const metadata: Metadata = { title: 'Transaction' };

export default function Page() {
  return (
    <Suspense>
      <TransactionDetailRoute />
    </Suspense>
  );
}
