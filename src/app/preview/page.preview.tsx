import { Suspense } from 'react';
import { PreviewRoute } from './preview-client';

export default function PreviewPage() {
  return (
    <Suspense>
      <PreviewRoute />
    </Suspense>
  );
}
