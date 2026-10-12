import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DURATION_MAX,
  PRESETS,
  ZERO_DURATION,
  resolvePreset,
  resolveSendAt,
  toDatetimeLocalValue,
  type Duration,
  type Preset,
} from './scheduledMessages';

const DURATION_FIELDS: (keyof Duration)[] = ['days', 'hours', 'minutes', 'seconds'];

interface Props {
  initialMessage: string;
  /** The reservation's time when editing; the form then opens on the exact time. */
  initialSendAt?: string;
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (sendAt: Date, message: string) => void;
}

/** The message and when to send it. Cmd/Ctrl+Enter submits; Enter is a new line, as in the chat input. */
export function ScheduleForm({ initialMessage, initialSendAt, submitLabel, cancelLabel, onCancel, onSubmit }: Props) {
  const { t } = useTranslation();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState(initialMessage);
  const [preset, setPreset] = useState<Preset>(initialSendAt ? 'custom' : 'in1hour');
  const [duration, setDuration] = useState<Duration>(ZERO_DURATION);
  const [custom, setCustom] = useState(() => toDatetimeLocalValue(
    initialSendAt ? new Date(Date.parse(initialSendAt)) : resolvePreset('in1hour', Date.now()),
  ));

  useEffect(() => {
    const el = messageRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const canSubmit = message.trim().length > 0 && resolveSendAt(preset, duration, custom, Date.now()) !== null;

  const submit = () => {
    const sendAt = resolveSendAt(preset, duration, custom, Date.now());
    if (!sendAt || !message.trim()) return;
    onSubmit(sendAt, message.trim());
  };

  const setField = (key: keyof Duration, raw: string) => {
    const n = Math.max(0, Math.min(DURATION_MAX[key], Math.floor(Number(raw) || 0)));
    setDuration((prev) => ({ ...prev, [key]: n }));
  };

  return (
    <div
      className="scheduled-form"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="scheduled-body">
        <label className="scheduled-field">
          <span className="scheduled-label">{t('chat.scheduled.message')}</span>
          <textarea
            ref={messageRef}
            className="scheduled-input scheduled-message-input"
            value={message}
            rows={4}
            placeholder={t('chat.scheduled.messagePlaceholder')}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>

        <label className="scheduled-field">
          <span className="scheduled-label">{t('chat.scheduled.when')}</span>
          <select
            className="scheduled-input"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            {PRESETS.map((p) => (
              <option key={p} value={p}>{t(`chat.scheduled.presets.${p}`)}</option>
            ))}
          </select>
        </label>

        {preset === 'afterDuration' && (
          <div className="scheduled-duration">
            {DURATION_FIELDS.map((key) => (
              <label key={key} className="scheduled-duration-field">
                <input
                  type="number"
                  className="scheduled-input scheduled-number"
                  min={0}
                  max={DURATION_MAX[key]}
                  value={duration[key]}
                  aria-label={t(`chat.scheduled.duration.${key}`)}
                  onChange={(e) => setField(key, e.target.value)}
                />
                <span className="scheduled-label">{t(`chat.scheduled.duration.${key}`)}</span>
              </label>
            ))}
          </div>
        )}

        {preset === 'custom' && (
          <input
            type="datetime-local"
            step={1}
            className="scheduled-input"
            value={custom}
            aria-label={t('chat.scheduled.customLabel')}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}
      </div>

      <div className="scheduled-footer">
        <span className="scheduled-hint">{t('chat.scheduled.submitHint')}</span>
        <button type="button" className="scheduled-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="scheduled-primary" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
