import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { storedChatScale } from '../utils/fontScale';
import { forceWebviewRepaint } from '../utils/forceWebviewRepaint';
import {
  UI_ZOOM_DEFAULT,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  getUiZoom,
  setUiZoom,
  stepUiZoomIn,
  stepUiZoomOut,
  uiZoomGestureOf,
  useUiZoom,
  type UiZoomGesture,
} from '../utils/uiZoom';

/** How long the indicator stays after the last adjustment. */
export const UI_ZOOM_INDICATOR_HOLD_MS = 3000;

export function nextUiZoom(level: number, gesture: UiZoomGesture): number {
  if (gesture === 'in') return stepUiZoomIn(level);
  if (gesture === 'out') return stepUiZoomOut(level);
  return UI_ZOOM_DEFAULT;
}

/**
 * Applies the interface zoom and owns its keys: Ctrl/Cmd + "+", "-" and "0".
 *
 * While adjusting, a small panel in the top-right corner shows the percentage
 * with the same three actions as buttons, the way Chrome does. It is one panel
 * whose number changes, not a toast per key press, and it stays while the
 * pointer is on it so it cannot vanish under a click.
 */
export function UiZoomControls() {
  const { t } = useTranslation();
  const level = useUiZoom();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!held.current) setVisible(false);
    }, UI_ZOOM_INDICATOR_HOLD_MS);
  }, []);

  const adjust = useCallback(
    (gesture: UiZoomGesture) => {
      setUiZoom(nextUiZoom(getUiZoom(), gesture));
      setVisible(true);
      scheduleHide();
    },
    [scheduleHide],
  );

  // The zoom is one factor of `--font-scale`; the font size setting is the other.
  const isFirstApply = useRef(true);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', storedChatScale().toString());
    if (isFirstApply.current) {
      isFirstApply.current = false;
      return;
    }
    // A CSS variable change alone leaves the OSR surface stale on Linux.
    forceWebviewRepaint('ui-zoom-change');
  }, [level]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const gesture = uiZoomGestureOf(e);
      if (gesture === null) {
        if (e.key === 'Escape') setVisible(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      adjust(gesture);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [adjust]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="ui-zoom-indicator"
      role="dialog"
      aria-label={t('uiZoom.label')}
      onMouseEnter={() => {
        held.current = true;
        if (hideTimer.current) clearTimeout(hideTimer.current);
      }}
      onMouseLeave={() => {
        held.current = false;
        scheduleHide();
      }}
    >
      <span className="ui-zoom-indicator-value">{Math.round(level * 100)}%</span>
      <button
        type="button"
        className="ui-zoom-indicator-button"
        onClick={() => adjust('out')}
        disabled={level <= UI_ZOOM_MIN}
        aria-label={t('uiZoom.zoomOut')}
        title={t('uiZoom.zoomOut')}
      >
        <span className="codicon codicon-remove" />
      </button>
      <button
        type="button"
        className="ui-zoom-indicator-button"
        onClick={() => adjust('in')}
        disabled={level >= UI_ZOOM_MAX}
        aria-label={t('uiZoom.zoomIn')}
        title={t('uiZoom.zoomIn')}
      >
        <span className="codicon codicon-add" />
      </button>
      <span className="ui-zoom-indicator-divider" />
      <button type="button" className="ui-zoom-indicator-reset" onClick={() => adjust('reset')}>
        {t('uiZoom.reset')}
      </button>
    </div>
  );
}
