'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { canonicalRoute } from '@/lib/routes';
import { t } from '@/lib/strings';

const noSubscribe = () => () => undefined;
const readTarget = () => canonicalRoute(window.location.pathname, window.location.search) ?? '';

export default function NotFound() {
  const router = useRouter();
  const target = useSyncExternalStore(noSubscribe, readTarget, () => null);

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (target !== '') return null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-[20px] font-medium text-ink">{t.notFound.title}</h1>
      <Link href="/" className="font-medium text-brand-ink underline-offset-4 hover:underline">
        {t.notFound.home}
      </Link>
    </main>
  );
}
