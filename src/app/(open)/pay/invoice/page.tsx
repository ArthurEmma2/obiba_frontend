import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InvoiceRoute } from '@/features/wallet/pay';

export const metadata: Metadata = { title: 'Pay a bill' };

export default function Page() {
  return (
    <Suspense>
      <InvoiceRoute />
    </Suspense>
  );
}
