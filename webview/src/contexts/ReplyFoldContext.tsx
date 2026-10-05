import { createContext, useContext } from 'react';

/**
 * Which replies are folded away, keyed by the message the user typed that
 * opens them. Ported from the Claude Code GUI ("Swttch") plugin's "Collapse
 * reply": fold a few replies and a long session becomes the list of things you
 * asked.
 *
 * Provided by MessageList, which knows the turns; read by the message's own
 * header, which draws the toggle. Absent outside a message list, where nothing
 * can be folded.
 */
export interface ReplyFoldState {
  /** Whether the turn opened by [messageKey] has a reply that can be folded. */
  canFold: (messageKey: string) => boolean;
  isFolded: (messageKey: string) => boolean;
  toggle: (messageKey: string) => void;
}

export const ReplyFoldContext = createContext<ReplyFoldState | null>(null);

export function useReplyFold(): ReplyFoldState | null {
  return useContext(ReplyFoldContext);
}
