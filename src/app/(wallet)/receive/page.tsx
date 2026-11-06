import type { Metadata } from 'next';
import { Receive } from '@/features/wallet/add';

export const metadata: Metadata = { title: 'Receive' };

export default function Page() {
  return <Receive />;
}
