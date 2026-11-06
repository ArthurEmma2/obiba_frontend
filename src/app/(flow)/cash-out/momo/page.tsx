import type { Metadata } from 'next';
import { LocalFlow } from '@/features/wallet/local';

export const metadata: Metadata = { title: 'Cash out to mobile money' };

export default function Page() {
  return <LocalFlow kind="MOMO_PAYOUT" />;
}
