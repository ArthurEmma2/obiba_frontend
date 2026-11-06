import { PreviewClient } from './preview-client';

export default async function PreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  return <PreviewClient scenario={typeof p.step === 'string' ? p.step : null} />;
}
