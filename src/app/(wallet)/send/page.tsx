import type { Metadata } from 'next';
import { SendHub } from '@/features/wallet/send';

export const metadata: Metadata = { title: 'Send' };

export default function Page() {
  return <SendHub />;
}
