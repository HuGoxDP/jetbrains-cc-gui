import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendToJava } from '../../utils/bridge';
import './LimitResumeNotice.css';

/** A time as the notice says it: the hour today, the day and hour otherwise (a weekly limit). */
export function formatResumeTime(atMs: number, locale: string, now = new Date()): string {
  const at = new Date(atMs);
  const sameDay = at.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at);
}

/** What `updateLimitResume` carries: when the conversation continues, or null. */
export function parseResumeAt(json: string): number | null {
  try {
    const at = (JSON.parse(json) as { at?: unknown })?.at;
    return typeof at === 'number' && Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

/**
 * Above the input while a conversation waits for its usage limit to reset (ported from
 * Swttch's auto-resume): when it will continue, and Cancel. The IDE keeps the wait; this
 * only shows it, and asks once on mount in case the wait began before the chat was shown.
 */
export function LimitResumeNotice() {
  const { t, i18n } = useTranslation();
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    window.updateLimitResume = (json: string) => setAt(parseResumeAt(json));
    sendToJava('get_limit_resume', {});
    return () => {
      delete window.updateLimitResume;
    };
  }, []);

  if (at === null) return null;

  return (
    <div className="limit-resume-notice" role="status">
      <span className="codicon codicon-history" aria-hidden="true" />
      <span className="limit-resume-text">{t('chat.limitResume.waiting', { time: formatResumeTime(at, i18n.language) })}</span>
      <button type="button" className="limit-resume-cancel" onClick={() => sendToJava('cancel_limit_resume', {})}>
        {t('chat.limitResume.cancel')}
      </button>
    </div>
  );
}
