import type { Metadata } from 'next';
import { LocalFlow } from '@/features/wallet/local';

export const metadata: Metadata = { title: 'Cash out to a bank' };

export default function Page() {
  return <LocalFlow kind="BANK_PAYOUT" />;
}
