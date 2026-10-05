/**
 * When a message was sent, written so it still says something days later.
 *
 * A bare "14:05" is enough for a conversation from today, and wrong for one
 * reopened next month: it reads as today. So the further back a message is,
 * the more of the date is written. Ported from the Claude Code GUI ("Swttch")
 * plugin's message footer, in this plugin's own 24-hour style:
 *
 * | Sent              | Shown           |
 * |-------------------|-----------------|
 * | today             | `14:05`         |
 * | the last 6 days   | `Thu 14:05`     |
 * | earlier this year | `Jun 27 14:05`  |
 * | another year      | `6/27/2025 14:05` |
 *
 * Every piece comes from `Intl.DateTimeFormat` in the interface language, so
 * names and order follow the locale without any strings to translate.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(timestamp: string | undefined): Date | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Midnight at the start of [date]'s day, in local time. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function format(date: Date, locale: string | undefined, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    // An unknown locale tag: the runtime's default still gives a readable date.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/** The short form shown next to a message. Empty for a missing or unreadable timestamp. */
export function formatMessageTime(timestamp: string | undefined, now: Date = new Date(), locale?: string): string {
  const date = parse(timestamp);
  if (!date) return '';
  const time = format(date, locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo <= 0) return time;
  if (daysAgo < 7) return `${format(date, locale, { weekday: 'short' })} ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${format(date, locale, { month: 'short', day: 'numeric' })} ${time}`;
  }
  return `${format(date, locale, { year: 'numeric', month: 'numeric', day: 'numeric' })} ${time}`;
}

/** The whole date and time, for the tooltip. Empty for a missing or unreadable timestamp. */
export function formatFullTimestamp(timestamp: string | undefined, locale?: string): string {
  const date = parse(timestamp);
  if (!date) return '';
  return format(date, locale, { dateStyle: 'full', timeStyle: 'medium' });
}
