import { withBase } from '@/lib/base-path';

export function Logo({ className = 'h-7 w-auto', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return <img src={withBase(tone === 'light' ? '/brand/obiba-logo-light.png' : '/brand/obiba-logo.png')} alt="Obiba" width={1140} height={285} className={className} decoding="async" />;
}
