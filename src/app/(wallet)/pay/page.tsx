import type { Metadata } from 'next';
import { PayHub } from '@/features/wallet/pay';

export const metadata: Metadata = { title: 'Pay' };

export default function Page() {
  return <PayHub />;
}
