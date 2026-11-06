import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DepositTrackerRoute } from '@/features/wallet/add';

export const metadata: Metadata = { title: 'Deposit' };

export default function Page() {
  return (
    <Suspense>
      <DepositTrackerRoute />
    </Suspense>
  );
}
