import { describe, expect, it } from 'vitest';
import {
  ZERO_DURATION,
  formatAbsolute,
  parseScheduledList,
  parseScheduledMessage,
  relativeParts,
  resolvePreset,
  resolveSendAt,
  toDatetimeLocalValue,
} from './scheduledMessages';

const reservation = {
  id: 'r1',
  sessionId: 's1',
  sendAt: '2026-10-12T10:00:00Z',
  message: 'hello',
  kind: 'USER_SCHEDULED',
  createdAt: '2026-10-12T09:00:00Z',
  provider: 'claude',
  cwd: '/p',
};

describe('scheduled messages', () => {
  it('reads what the IDE sends and keeps every field', () => {
    const list = parseScheduledList(JSON.stringify({ sessionId: 's1', schedules: [reservation, { id: 1 }] }));
    expect(list).toEqual({ sessionId: 's1', schedules: [reservation] });
    expect(parseScheduledList(JSON.stringify({ sessionId: 's1', schedules: [], error: 'time_invalid' }))?.error)
      .toBe('time_invalid');
    expect(parseScheduledList('{"schedules": []}')).toBeNull();
    expect(parseScheduledList('not json')).toBeNull();
    expect(parseScheduledMessage(JSON.stringify(reservation))).toEqual(reservation);
    expect(parseScheduledMessage('{"id": "x"}')).toBeNull();
  });

  it('turns each choice into a send time', () => {
    const now = new Date(2026, 9, 12, 22, 15, 30).getTime();
    expect(resolvePreset('in5min', now).getTime()).toBe(now + 5 * 60_000);
    expect(resolvePreset('in30min', now).getTime()).toBe(now + 30 * 60_000);
    expect(resolvePreset('in1hour', now).getTime()).toBe(now + 60 * 60_000);
    expect(resolvePreset('tomorrowMorning', now)).toEqual(new Date(2026, 9, 13, 9, 0, 0, 0));

    expect(resolveSendAt('afterDuration', { days: 1, hours: 2, minutes: 3, seconds: 4 }, '', now)?.getTime())
      .toBe(now + 86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 4_000);
    expect(resolveSendAt('afterDuration', ZERO_DURATION, '', now)).toBeNull();
    expect(resolveSendAt('custom', ZERO_DURATION, '2026-10-14T08:30:15', now))
      .toEqual(new Date(2026, 9, 14, 8, 30, 15));
    expect(resolveSendAt('custom', ZERO_DURATION, '', now)).toBeNull();
  });

  it('writes local times the way the date field and the list show them', () => {
    const d = new Date(2026, 0, 5, 7, 8, 9);
    expect(toDatetimeLocalValue(d)).toBe('2026-01-05T07:08:09');
    expect(formatAbsolute(d.toISOString())).toBe('2026-01-05 07:08:09');
    expect(formatAbsolute('nonsense')).toBe('nonsense');
  });

  it('counts down in the largest whole unit', () => {
    const now = 1_000_000;
    expect(relativeParts(now - 1, now)).toEqual({ unit: 'now', n: 0 });
    expect(relativeParts(now, now)).toEqual({ unit: 'now', n: 0 });
    expect(relativeParts(now + 400, now)).toEqual({ unit: 'second', n: 1 });
    expect(relativeParts(now + 59_000, now)).toEqual({ unit: 'second', n: 59 });
    expect(relativeParts(now + 60_000, now)).toEqual({ unit: 'minute', n: 1 });
    expect(relativeParts(now + 3_599_000, now)).toEqual({ unit: 'minute', n: 59 });
    expect(relativeParts(now + 3_600_000, now)).toEqual({ unit: 'hour', n: 1 });
    expect(relativeParts(now + 49 * 3_600_000, now)).toEqual({ unit: 'day', n: 2 });
  });
});
