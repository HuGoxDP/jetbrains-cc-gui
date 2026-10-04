import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageTurn } from './MessageTurn';

type Callback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let observed: { callback: Callback; target: Element | null; root: Element | null } | null = null;

class FakeObserver {
  constructor(callback: Callback, options?: IntersectionObserverInit) {
    observed = { callback, target: null, root: (options?.root as Element | null) ?? null };
  }
  observe(target: Element) { if (observed) observed.target = target; }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

const original = globalThis.IntersectionObserver;

beforeEach(() => {
  observed = null;
  globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = original;
  cleanup();
});

function renderTurn() {
  const view = render(
    <div className="messages-container" data-testid="scroller">
      <MessageTurn head={<div className="message user">ask</div>} jumpLabel="Back to where this message sits">
        <div>reply</div>
      </MessageTurn>
    </div>,
  );
  const pin = view.container.querySelector('.message-turn-pin') as HTMLElement;
  return { ...view, pin };
}

describe('MessageTurn', () => {
  it('puts the message in the pinned slot and its replies after it', () => {
    const { container, pin } = renderTurn();
    expect(pin.textContent).toContain('ask');
    expect(pin.textContent).not.toContain('reply');
    expect(container.querySelector('.message-turn')?.textContent).toContain('reply');
  });

  it('watches the marker above the message, inside the chat\'s scroller', () => {
    const { container } = renderTurn();
    expect(observed?.target).toBe(container.querySelector('.message-turn-marker'));
    expect(observed?.root).toBe(screen.getByTestId('scroller'));
  });

  it('is pinned only once the marker has gone out over the top', () => {
    const { pin } = renderTurn();
    expect(pin.dataset.pinned).toBe('false');

    act(() => observed?.callback([{ isIntersecting: false, boundingClientRect: { top: -40 } as DOMRect, rootBounds: { top: 0 } as DOMRect }]));
    expect(pin.dataset.pinned).toBe('true');

    // Below the bottom edge is not pinned: the turn has not reached the top yet.
    act(() => observed?.callback([{ isIntersecting: false, boundingClientRect: { top: 900 } as DOMRect, rootBounds: { top: 0 } as DOMRect }]));
    expect(pin.dataset.pinned).toBe('false');

    act(() => observed?.callback([{ isIntersecting: false, boundingClientRect: { top: -40 } as DOMRect, rootBounds: { top: 0 } as DOMRect }]));
    act(() => observed?.callback([{ isIntersecting: true, boundingClientRect: { top: 10 } as DOMRect, rootBounds: { top: 0 } as DOMRect }]));
    expect(pin.dataset.pinned).toBe('false');
  });

  it('scrolls the chat back to where the message sits', () => {
    renderTurn();
    const scroller = screen.getByTestId('scroller');
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
    Object.defineProperty(scroller, 'scrollTop', { value: 500, configurable: true });
    scroller.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
    const marker = scroller.querySelector('.message-turn-marker') as HTMLElement;
    marker.getBoundingClientRect = () => ({ top: -250 } as DOMRect);

    fireEvent.click(screen.getByRole('button', { name: 'Back to where this message sits' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 150, behavior: 'smooth' });
  });
});
