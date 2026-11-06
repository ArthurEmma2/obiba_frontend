import type { Metadata } from 'next';
import { CashOutHub } from '@/features/wallet/local';

export const metadata: Metadata = { title: 'Cash out' };

export default function Page() {
  return <CashOutHub />;
}
