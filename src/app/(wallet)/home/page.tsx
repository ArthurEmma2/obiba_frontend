import type { Metadata } from 'next';
import { Overview } from '@/features/wallet/overview';

export const metadata: Metadata = { title: 'Overview' };

export default function HomePage() {
  return <Overview />;
}
