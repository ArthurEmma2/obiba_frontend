export const ROUTE_START_EVENT = 'obiba:route-start';

export interface RouteStartDetail {
  url: string;
}

export function announceRouteStart(url: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RouteStartDetail>(ROUTE_START_EVENT, { detail: { url } }));
}

const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export function isSameDocument(url: string): boolean {
  const next = new URL(url, window.location.href);
  return next.origin === window.location.origin && trimSlash(next.pathname) === trimSlash(window.location.pathname) && next.search === window.location.search;
}
