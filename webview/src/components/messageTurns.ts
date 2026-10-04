/**
 * A run of consecutive messages, by index into the list they came from.
 * [start, end) like Array.slice.
 */
export interface MessageTurnRange {
  start: number;
  end: number;
  /** Opens with a message the user typed, which is what gets pinned. */
  pinned: boolean;
}

/**
 * Split messages into turns: each message the user typed starts one, and every
 * message after it up to the next belongs to it. Messages before the first one
 * the user typed form a leading turn with nothing to pin.
 *
 * Tool results arrive as "user" messages too, roughly ten for every real one;
 * [isHead] is what tells them apart, so a tool result never starts a turn (it
 * would pin a blank row on every tool call).
 */
export function groupMessageTurns<T>(messages: readonly T[], isHead: (message: T) => boolean): MessageTurnRange[] {
  const turns: MessageTurnRange[] = [];
  let start = 0;
  let pinned = false;
  messages.forEach((message, index) => {
    if (!isHead(message)) return;
    if (index > start) turns.push({ start, end: index, pinned });
    start = index;
    pinned = true;
  });
  if (messages.length > start) turns.push({ start, end: messages.length, pinned });
  return turns;
}
