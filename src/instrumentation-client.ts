import { announceRouteStart } from '@/lib/route-events';

export function onRouterTransitionStart(url: string): void {
  announceRouteStart(url);
}
