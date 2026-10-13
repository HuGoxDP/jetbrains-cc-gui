import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { HeaderActionId } from '../../utils/headerDock';

export interface HeaderDockItem {
  id: HeaderActionId;
  icon: string;
  label: string;
  /** A count the action shows (scheduled messages); nothing at zero. */
  badge?: number;
  docked: boolean;
  run: () => void;
}

interface HeaderDockMenuProps {
  items: HeaderDockItem[];
  t: TFunction;
  onToggleDocked: (id: HeaderActionId) => void;
  /** The shown items in their new order. */
  onReorder: (order: HeaderActionId[]) => void;
}

/**
 * The ⋮ menu of the chat header (ported from Swttch's header dock): every header action,
 * whether or not it is in the header. A row has three separate spots: the handle on the
 * left reorders, the middle runs the action, the eye on the right puts it in the header or
 * takes it out. Reordering works with the keyboard too: Space on a handle picks the row up,
 * ↑ ↓ move it, Space drops it, Escape puts it back.
 */
export function HeaderDockMenu({ items, t, onToggleDocked, onReorder }: HeaderDockMenuProps) {
  const [open, setOpen] = useState(false);
  /** The order while a row is being moved; null otherwise. */
  const [draft, setDraft] = useState<HeaderActionId[] | null>(null);
  const [moving, setMoving] = useState<HeaderActionId | null>(null);
  /** True while the moving row follows the pointer (rather than the arrow keys). */
  const [pointerMove, setPointerMove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<HeaderActionId, HTMLLIElement>());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const byId = new Map(items.map((item) => [item.id, item]));
  const rows = (draft ?? items.map((item) => item.id)).map((id) => byId.get(id)).filter(Boolean) as HeaderDockItem[];

  const cancelMove = useCallback(() => {
    setDraft(null);
    setMoving(null);
    setPointerMove(false);
  }, []);

  const dropMove = useCallback(() => {
    const order = draftRef.current;
    if (order) onReorder(order);
    setDraft(null);
    setMoving(null);
    setPointerMove(false);
  }, [onReorder]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        cancelMove();
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (moving) {
        cancelMove();
      } else {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, moving, cancelMove]);

  const startMove = (id: HeaderActionId) => {
    setDraft(items.map((item) => item.id));
    setMoving(id);
  };

  const shift = (id: HeaderActionId, by: number) => {
    setDraft((current) => {
      const order = [...(current ?? items.map((item) => item.id))];
      const from = order.indexOf(id);
      const to = Math.max(0, Math.min(order.length - 1, from + by));
      if (from < 0 || from === to) return current;
      order.splice(from, 1);
      order.splice(to, 0, id);
      return order;
    });
  };

  const onHandleKeyDown = (e: React.KeyboardEvent, id: HeaderActionId) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (moving === id) dropMove(); else startMove(id);
    } else if (moving === id && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      shift(id, e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const onHandlePointerDown = (e: React.PointerEvent, id: HeaderActionId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startMove(id);
    setPointerMove(true);
  };

  // The pointer is followed on the window: the rows change places in the DOM as it moves.
  useEffect(() => {
    if (!pointerMove || !moving) return;
    const onMove = (e: PointerEvent) => {
      const order = draftRef.current;
      if (!order) return;
      // Over another row's middle: the moving row takes its place.
      for (const otherId of order) {
        if (otherId === moving) continue;
        const rect = rowRefs.current.get(otherId)?.getBoundingClientRect();
        if (!rect) continue;
        const mid = rect.top + rect.height / 2;
        const from = order.indexOf(moving);
        const to = order.indexOf(otherId);
        if ((to < from && e.clientY < mid) || (to > from && e.clientY > mid)) {
          shift(moving, to - from);
          break;
        }
      }
    };
    const onUp = () => dropMove();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancelMove);
    };
  }, [pointerMove, moving, dropMove, cancelMove]); // shift reads the order through setDraft

  const menuLabel = t('chat.headerDock.menu');

  return (
    <div className="header-dock" ref={rootRef}>
      <button
        className="icon-button header-dock-button"
        onClick={() => { cancelMove(); setOpen((value) => !value); }}
        data-tooltip={menuLabel}
        aria-label={menuLabel}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="codicon codicon-kebab-vertical" />
      </button>
      {open && (
        <div className="header-dock-menu" role="dialog" aria-label={menuLabel}>
          <ul className="header-dock-list">
            {rows.map((item) => {
              const showLabel = item.docked ? t('chat.headerDock.hide') : t('chat.headerDock.show');
              return (
                <li
                  key={item.id}
                  ref={(node) => {
                    if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id);
                  }}
                  className={`header-dock-row${moving === item.id ? ' is-moving' : ''}`}
                >
                  <button
                    type="button"
                    className="header-dock-handle"
                    aria-label={t('chat.headerDock.move', { name: item.label })}
                    aria-pressed={moving === item.id}
                    onKeyDown={(e) => onHandleKeyDown(e, item.id)}
                    onPointerDown={(e) => onHandlePointerDown(e, item.id)}
                  >
                    <span className="codicon codicon-gripper" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="header-dock-run"
                    onClick={() => { setOpen(false); item.run(); }}
                  >
                    <span className={`codicon ${item.icon}`} aria-hidden="true" />
                    <span className="header-dock-label">{item.label}</span>
                    {item.badge ? <span className="header-dock-badge">{item.badge}</span> : null}
                  </button>
                  <button
                    type="button"
                    className={`header-dock-eye${item.docked ? ' is-docked' : ''}`}
                    aria-label={`${showLabel}: ${item.label}`}
                    aria-pressed={item.docked}
                    title={showLabel}
                    onClick={() => onToggleDocked(item.id)}
                  >
                    <span className={`codicon ${item.docked ? 'codicon-eye' : 'codicon-eye-closed'}`} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="header-dock-hint">{t('chat.headerDock.hint')}</p>
        </div>
      )}
    </div>
  );
}
