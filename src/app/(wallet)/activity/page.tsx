import type { Metadata } from 'next';
import { Activity } from '@/features/wallet/records';

export const metadata: Metadata = { title: 'Activity' };

export default function Page() {
  return <Activity />;
}
