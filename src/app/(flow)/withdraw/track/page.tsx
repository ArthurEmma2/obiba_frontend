import type { Metadata } from 'next';
import { Suspense } from 'react';
import { WithdrawalTrackerRoute } from '@/features/wallet/withdraw';

export const metadata: Metadata = { title: 'Withdrawal' };

export default function Page() {
  return (
    <Suspense>
      <WithdrawalTrackerRoute />
    </Suspense>
  );
}
