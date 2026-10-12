/**
 * Scheduled messages ("send later", ported from Swttch): the reservation the IDE keeps,
 * the send-time presets and the formatting the list uses. Pure, so it is tested with a
 * fixed clock.
 */

/** One reservation, as the IDE stores and sends it (field names as in Swttch). */
export interface ScheduledMessage {
  id: string;
  sessionId: string;
  /** ISO-8601 instant at which the message is sent. */
  sendAt: string;
  message: string;
  kind?: string;
  createdAt?: string;
  provider?: string;
  cwd?: string;
}

/** What `updateScheduledMessages` carries. */
export interface ScheduledList {
  sessionId: string;
  schedules: ScheduledMessage[];
  /** Why the last request was refused, when it was. */
  error?: string;
}

function isScheduledMessage(value: unknown): value is ScheduledMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return typeof m.id === 'string' && typeof m.sessionId === 'string'
    && typeof m.sendAt === 'string' && typeof m.message === 'string';
}

export function parseScheduledList(json: string): ScheduledList | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (!raw || typeof raw.sessionId !== 'string') return null;
    const schedules = Array.isArray(raw.schedules) ? raw.schedules.filter(isScheduledMessage) : [];
    return {
      sessionId: raw.sessionId,
      schedules,
      ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
    };
  } catch {
    return null;
  }
}

export function parseScheduledMessage(json: string): ScheduledMessage | null {
  try {
    const raw = JSON.parse(json) as unknown;
    return isScheduledMessage(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The "When" choices, in menu order. */
export const PRESETS = ['in5min', 'in30min', 'in1hour', 'tomorrowMorning', 'afterDuration', 'custom'] as const;
export type Preset = (typeof PRESETS)[number];

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const ZERO_DURATION: Duration = { days: 0, hours: 0, minutes: 0, seconds: 0 };

/** Upper bound of each "After a duration" field. */
export const DURATION_MAX: Duration = { days: 365, hours: 23, minutes: 59, seconds: 59 };

export function durationToMs(d: Duration): number {
  return d.days * 86_400_000 + d.hours * 3_600_000 + d.minutes * 60_000 + d.seconds * 1_000;
}

/** A fixed preset as a time; the open-ended ones (duration, custom) answer `now`. */
export function resolvePreset(preset: Preset, now: number): Date {
  switch (preset) {
    case 'in5min':
      return new Date(now + 5 * 60_000);
    case 'in30min':
      return new Date(now + 30 * 60_000);
    case 'in1hour':
      return new Date(now + 60 * 60_000);
    case 'tomorrowMorning': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    default:
      return new Date(now);
  }
}

/** A time as the value of `<input type="datetime-local" step="1">`: local, to the second. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** The send time a choice stands for, or null when it is not a time yet. */
export function resolveSendAt(preset: Preset, duration: Duration, custom: string, now: number): Date | null {
  if (preset === 'custom') {
    const ms = Date.parse(custom);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  if (preset === 'afterDuration') {
    const ms = durationToMs(duration);
    return ms > 0 ? new Date(now + ms) : null;
  }
  return resolvePreset(preset, now);
}

/** The exact send time, `YYYY-MM-DD HH:mm:ss` in local time. */
export function formatAbsolute(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface RelativeParts {
  unit: 'day' | 'hour' | 'minute' | 'second' | 'now';
  n: number;
}

/** How long until the send time, in the largest whole unit; `now` once it is due. */
export function relativeParts(sendAtMs: number, nowMs: number): RelativeParts {
  const diff = sendAtMs - nowMs;
  if (Number.isNaN(diff) || diff <= 0) return { unit: 'now', n: 0 };
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return { unit: 'second', n: Math.max(1, sec) };
  const min = Math.floor(sec / 60);
  if (min < 60) return { unit: 'minute', n: min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { unit: 'hour', n: hr };
  return { unit: 'day', n: Math.floor(hr / 24) };
}
