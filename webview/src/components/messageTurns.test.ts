import { describe, expect, it } from 'vitest';
import { groupMessageTurns } from './messageTurns';

const isHead = (m: string) => m.startsWith('U');

describe('groupMessageTurns', () => {
  it('starts a turn at each message the user typed', () => {
    expect(groupMessageTurns(['U1', 'a', 'r', 'a', 'U2', 'a'], isHead)).toEqual([
      { start: 0, end: 4, pinned: true },
      { start: 4, end: 6, pinned: true },
    ]);
  });

  it('keeps a leading run with nothing to pin', () => {
    expect(groupMessageTurns(['a', 'b', 'U1', 'a'], isHead)).toEqual([
      { start: 0, end: 2, pinned: false },
      { start: 2, end: 4, pinned: true },
    ]);
  });

  it('handles back-to-back messages, an empty list and a list with no user message', () => {
    expect(groupMessageTurns(['U1', 'U2'], isHead)).toEqual([
      { start: 0, end: 1, pinned: true },
      { start: 1, end: 2, pinned: true },
    ]);
    expect(groupMessageTurns([], isHead)).toEqual([]);
    expect(groupMessageTurns(['a', 'b'], isHead)).toEqual([{ start: 0, end: 2, pinned: false }]);
  });
});
