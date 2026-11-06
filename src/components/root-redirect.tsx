'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/lib/services';
import { t } from '@/lib/strings';

export function RootRedirect() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
    if (session.status === 'signed-in') router.replace('/onboarding');
  }, [session.status, router]);
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted" role="status">
      <Spinner />
      <span className="sr-only">{t.common.loading}</span>
    </div>
  );
}
