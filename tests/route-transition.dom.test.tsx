import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteTransition } from '@/components/route-transition';
import { announceRouteStart } from '@/lib/route-events';

const nav = vi.hoisted(() => ({ path: '/' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
}));

function mount() {
  const view = render(<RouteTransition />);
  const root = () => view.container.querySelector<HTMLElement>('[data-route-transition]')!;
  const arrive = (path: string) => {
    nav.path = path;
    view.rerender(<RouteTransition />);
  };
  return { root, arrive };
}

const visible = (el: HTMLElement) => el.style.visibility === 'visible';
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('route transition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nav.path = '/';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never shows for a fast navigation', () => {
    const { root, arrive } = mount();
    act(() => announceRouteStart('/home'));
    wait(120);
    arrive('/home');
    wait(1000);
    expect(visible(root())).toBe(false);
  });

  it('shows for a slow navigation and stays long enough not to flash', () => {
    const { root, arrive } = mount();
    act(() => announceRouteStart('/activity'));
    wait(170);
    expect(visible(root())).toBe(true);
    arrive('/activity');
    wait(300);
    expect(visible(root())).toBe(true);
    wait(100);
    expect(visible(root())).toBe(false);
  });

  it('ignores navigation to the page already open', () => {
    const { root } = mount();
    act(() => announceRouteStart(window.location.href));
    wait(500);
    expect(visible(root())).toBe(false);
  });

  it('treats a trailing slash as the same page', () => {
    window.history.replaceState(null, '', '/sign-in/');
    const { root } = mount();
    act(() => announceRouteStart('/sign-in'));
    wait(500);
    expect(visible(root())).toBe(false);
    window.history.replaceState(null, '', '/');
  });

  it('gives up if the navigation never lands', () => {
    const { root } = mount();
    act(() => announceRouteStart('/send'));
    wait(200);
    expect(visible(root())).toBe(true);
    wait(12_500);
    expect(visible(root())).toBe(false);
  });

  it('is hidden from assistive technology', () => {
    const { root } = mount();
    expect(root().getAttribute('aria-hidden')).toBe('true');
  });
});
