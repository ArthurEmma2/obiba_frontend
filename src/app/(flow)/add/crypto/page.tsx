import type { Metadata } from 'next';
import { AddCrypto } from '@/features/wallet/add';

export const metadata: Metadata = { title: 'Add from another network' };

export default function Page() {
  return <AddCrypto />;
}
