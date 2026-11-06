import type { Metadata } from 'next';
import { SendFlow } from '@/features/wallet/send';

export const metadata: Metadata = { title: 'Send to a NEAR address' };

export default function Page() {
  return <SendFlow mode="near" />;
}
