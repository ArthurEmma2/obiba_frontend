import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocalFlow, type LocalKind } from '@/features/wallet/local';

const KINDS: Record<string, { kind: LocalKind; title: string }> = {
  airtime: { kind: 'AIRTIME', title: 'Airtime' },
  data: { kind: 'DATA', title: 'Data bundles' },
  electricity: { kind: 'ECG', title: 'Electricity' },
  water: { kind: 'WATER', title: 'Water' },
  tv: { kind: 'TV', title: 'TV subscriptions' },
};

export function generateStaticParams() {
  return Object.keys(KINDS).map((kind) => ({ kind }));
}

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: KINDS[kind]?.title ?? 'Services' };
}

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const k = KINDS[kind];
  if (!k) notFound();
  return <LocalFlow kind={k.kind} />;
}
