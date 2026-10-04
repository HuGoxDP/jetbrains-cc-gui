import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { getLogicalOffsetTop } from '../utils/viewport';

/** The scrolling element of the chat, which a pinned message sticks to. */
const SCROLL_CONTAINER_SELECTOR = '.messages-container';

interface MessageTurnProps {
  /** The user message that opens the turn; it stays pinned while the turn is on screen. */
  head: ReactNode;
  /** Everything that answers it, up to the next user message. */
  children: ReactNode;
  /** Label of the button that scrolls back to where the message sits. */
  jumpLabel: string;
}

/** Up-arrow into a line: "back to where this sits". */
const JumpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 2.5h10M8 13.5V5.5M4.5 9 8 5.5 11.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * One turn of the conversation: a user message and the replies to it.
 *
 * The message is `position: sticky`, so it stays at the top of the chat while its
 * replies scroll past, and leaves with the turn when the turn ends: the next
 * message pushes it out instead of stacking on it. That is why each turn needs
 * its own box; a sticky element never leaves the box it sits in.
 *
 * Whether the message is pinned right now comes from a zero-height marker just
 * above it: once the marker has scrolled out over the top, the message is the
 * one held there. The browser reports that crossing by itself, so nothing is
 * recomputed while scrolling. The state is written to `data-pinned` directly,
 * which is all the styles need, so pinning never re-renders the messages.
 */
export function MessageTurn({ head, children, jumpLabel }: MessageTurnProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    const pin = pinRef.current;
    if (!marker || !pin || typeof IntersectionObserver === 'undefined') return;
    const root = marker.closest(SCROLL_CONTAINER_SELECTOR);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const rootTop = entry.rootBounds?.top ?? 0;
        const pinned = !entry.isIntersecting && entry.boundingClientRect.top < rootTop;
        pin.dataset.pinned = pinned ? 'true' : 'false';
      },
      { root: root instanceof HTMLElement ? root : null, threshold: 0 },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  const jumpBack = useCallback(() => {
    const marker = markerRef.current;
    const container = marker?.closest(SCROLL_CONTAINER_SELECTOR);
    if (!marker || !(container instanceof HTMLElement)) return;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + getLogicalOffsetTop(marker, container)),
      behavior: 'smooth',
    });
  }, []);

  return (
    <div className="message-turn">
      <div ref={markerRef} className="message-turn-marker" aria-hidden="true" />
      <div ref={pinRef} className="message-turn-pin" data-pinned="false">
        {head}
        <button
          type="button"
          className="message-turn-jump"
          onClick={jumpBack}
          title={jumpLabel}
          aria-label={jumpLabel}
        >
          <JumpIcon />
        </button>
      </div>
      {children}
    </div>
  );
}
