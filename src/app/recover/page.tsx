import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { RestoreFlowRoute } from '@/features/recover/restore-flow';

export const metadata: Metadata = { title: 'Restore your account', referrer: 'no-referrer' };

export default function RestorePage() {
  return (
    <AuthShell start={4}>
      <Suspense>
        <RestoreFlowRoute />
      </Suspense>
    </AuthShell>
  );
}
