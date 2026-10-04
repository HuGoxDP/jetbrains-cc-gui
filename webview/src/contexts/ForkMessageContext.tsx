import { createContext, useContext } from 'react';
import type { ClaudeMessage } from '../types';

/** Forks the conversation at one of the user's messages. */
export type ForkMessageFn = (message: ClaudeMessage) => void;

/**
 * Carries the fork action down to the user messages that offer it, past the four
 * components in between that have no use for it. Null while a fork is not possible
 * (another provider, no saved session yet, a reply still streaming), which hides the
 * button.
 */
export const ForkMessageContext = createContext<ForkMessageFn | null>(null);

export function useForkMessage(): ForkMessageFn | null {
  return useContext(ForkMessageContext);
}
