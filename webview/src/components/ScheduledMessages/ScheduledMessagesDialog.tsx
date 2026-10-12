import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduledMessagesApi } from './useScheduledMessages';
import { ScheduleForm } from './ScheduleForm';
import { formatAbsolute, relativeParts, type ScheduledMessage } from './scheduledMessages';

/** Re-render every second while the list is shown, so "in N …" counts down. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function ReservationRow({ reservation, now, onEdit, onCancel }: {
  reservation: ScheduledMessage;
  now: number;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const rel = relativeParts(Date.parse(reservation.sendAt), now);
  const relative = rel.unit === 'now'
    ? t('chat.scheduled.relative.now')
    : t(`chat.scheduled.relative.${rel.unit}`, { n: rel.n });

  return (
    <li className="scheduled-row" data-testid="scheduled-row">
      <div className="scheduled-row-top">
        <button
          type="button"
          className={`scheduled-row-message${expanded ? ' expanded' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? t('chat.scheduled.collapse') : t('chat.scheduled.expand')}
        >
          {reservation.message}
        </button>
        <span className="scheduled-row-relative">{relative}</span>
      </div>
      <div className="scheduled-row-bottom">
        <span className="scheduled-row-time">{formatAbsolute(reservation.sendAt)}</span>
        <span className="scheduled-row-actions">
          <button type="button" className="scheduled-link" onClick={onEdit}>
            {t('chat.scheduled.edit')}
          </button>
          <button type="button" className="scheduled-link danger" onClick={onCancel}>
            {t('chat.scheduled.cancel')}
          </button>
        </span>
      </div>
    </li>
  );
}

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; reservation: ScheduledMessage };

interface Props {
  api: ScheduledMessagesApi;
  /** What is typed in the chat input now; a new message starts from it. */
  getDraft: () => string;
  onClose: () => void;
}

/**
 * The open conversation's scheduled messages: the list with a live countdown, and the form
 * that schedules a new one or changes one. Opens on the form when nothing is scheduled yet.
 */
export function ScheduledMessagesDialog({ api, getDraft, onClose }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(() => (api.schedules.length === 0 ? { kind: 'create' } : { kind: 'list' }));
  const [draft] = useState(getDraft);
  const now = useNow(mode.kind === 'list');

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Escape is taken in the capture phase, so it closes this and does not reach the chat
  // input or stop a running turn underneath.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const title = mode.kind === 'create'
    ? t('chat.scheduled.createTitle')
    : mode.kind === 'edit' ? t('chat.scheduled.editTitle') : t('chat.scheduled.title');

  return (
    <div
      className="scheduled-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="scheduled-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="scheduled-header">
          <span className="codicon codicon-watch" aria-hidden="true" />
          <h3 id={titleId} className="scheduled-title">{title}</h3>
          <button
            type="button"
            className="scheduled-close"
            aria-label={t('chat.scheduled.close')}
            title={t('chat.scheduled.close')}
            onClick={onClose}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>

        {mode.kind === 'list' ? (
          <>
            <div className="scheduled-body">
              {api.schedules.length === 0 ? (
                <p className="scheduled-empty">{t('chat.scheduled.empty')}</p>
              ) : (
                <ul className="scheduled-list">
                  {api.schedules.map((m) => (
                    <ReservationRow
                      key={m.id}
                      reservation={m}
                      now={now}
                      onEdit={() => setMode({ kind: 'edit', reservation: m })}
                      onCancel={() => api.cancel(m.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className="scheduled-footer">
              <button type="button" className="scheduled-primary" onClick={() => setMode({ kind: 'create' })}>
                <span className="codicon codicon-add" aria-hidden="true" />
                {t('chat.scheduled.new')}
              </button>
            </div>
          </>
        ) : (
          <ScheduleForm
            key={mode.kind === 'edit' ? mode.reservation.id : 'create'}
            initialMessage={mode.kind === 'edit' ? mode.reservation.message : draft}
            initialSendAt={mode.kind === 'edit' ? mode.reservation.sendAt : undefined}
            submitLabel={mode.kind === 'edit' ? t('chat.scheduled.save') : t('chat.scheduled.schedule')}
            cancelLabel={api.schedules.length === 0 ? t('chat.scheduled.discard') : t('chat.scheduled.back')}
            onCancel={api.schedules.length === 0 ? onClose : () => setMode({ kind: 'list' })}
            onSubmit={(sendAt, message) => {
              if (mode.kind === 'edit') {
                api.update(mode.reservation.id, sendAt, message);
              } else {
                api.schedule(sendAt, message);
              }
              setMode({ kind: 'list' });
            }}
          />
        )}
      </div>
    </div>
  );
}
