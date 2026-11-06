import type { Metadata } from 'next';
import { WithdrawHub } from '@/features/wallet/withdraw';

export const metadata: Metadata = { title: 'Withdraw' };

export default function Page() {
  return <WithdrawHub />;
}
