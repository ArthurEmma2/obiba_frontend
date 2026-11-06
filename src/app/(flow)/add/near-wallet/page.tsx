import type { Metadata } from 'next';
import { NearWalletDeposit } from '@/features/wallet/near-wallet';

export const metadata: Metadata = { title: 'Deposit from a NEAR wallet' };

export default function Page() {
  return <NearWalletDeposit />;
}
