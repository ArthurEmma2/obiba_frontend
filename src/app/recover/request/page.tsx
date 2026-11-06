import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { RestoreRequestForm } from '@/features/recover/request-form';

export const metadata: Metadata = { title: 'Restore your account' };

export default function RestoreRequestPage() {
  return (
    <AuthShell start={2}>
      <RestoreRequestForm />
    </AuthShell>
  );
}
