import type { Metadata } from 'next';
import { WithdrawChain } from '@/features/wallet/withdraw';

export const metadata: Metadata = { title: 'Withdraw to another network' };

export default function Page() {
  return <WithdrawChain />;
}
