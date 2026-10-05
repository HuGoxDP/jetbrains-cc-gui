import { describe, expect, it } from 'vitest';
import { formatFullTimestamp, formatMessageTime } from './messageTime';

// A Monday afternoon, local time.
const now = new Date(2026, 9, 5, 15, 30);
const at = (y: number, m: number, d: number, h = 14, min = 5) => new Date(y, m, d, h, min).toISOString();

describe('formatMessageTime', () => {
  it('writes only the time for today', () => {
    expect(formatMessageTime(at(2026, 9, 5), now, 'en-US')).toBe('14:05');
    expect(formatMessageTime(at(2026, 9, 5, 0, 1), now, 'en-US')).toBe('00:01');
  });

  it('adds the weekday for the last six days, so yesterday does not read as today', () => {
    expect(formatMessageTime(at(2026, 9, 4), now, 'en-US')).toBe('Sun 14:05');
    expect(formatMessageTime(at(2026, 8, 29), now, 'en-US')).toBe('Tue 14:05');
  });

  it('adds the date from a week back, and the year from another year', () => {
    expect(formatMessageTime(at(2026, 8, 28), now, 'en-US')).toBe('Sep 28 14:05');
    expect(formatMessageTime(at(2025, 5, 27), now, 'en-US')).toBe('6/27/2025 14:05');
  });

  it('follows the interface language', () => {
    // The weekday is whatever this runtime's ICU data calls Sunday in German, not English.
    const sunday = new Intl.DateTimeFormat('de', { weekday: 'short' }).format(new Date(2026, 9, 4));
    expect(formatMessageTime(at(2026, 9, 4), now, 'de')).toBe(`${sunday} 14:05`);
    expect(sunday).not.toBe('Sun');
  });

  it('writes nothing for a missing or unreadable timestamp', () => {
    expect(formatMessageTime(undefined, now, 'en-US')).toBe('');
    expect(formatMessageTime('not a date', now, 'en-US')).toBe('');
  });
});

describe('formatFullTimestamp', () => {
  it('writes the whole date and time for the tooltip', () => {
    expect(formatFullTimestamp(at(2025, 5, 27), 'en-US')).toContain('2025');
    expect(formatFullTimestamp(undefined, 'en-US')).toBe('');
  });
});
