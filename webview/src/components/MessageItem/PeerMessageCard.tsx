import type { TFunction } from 'i18next';
import type { ClaudeMessage } from '../../types';

/**
 * Who sent a message that another Claude session delivered to this one with SendMessage,
 * and its words: the transcript entry's `origin` as the CLI writes it (`kind: "peer"`).
 * Null for anything else, including the CLI's task notifications, which carry no body.
 */
export function peerOrigin(message: ClaudeMessage): { name?: string; body: string } | null {
  // Chat processing already turns entries with a non-human origin into notifications.
  if (message.type !== 'user' && message.type !== 'notification') return null;
  const raw = message.raw;
  if (!raw || typeof raw !== 'object') return null;
  const origin = (raw as { origin?: unknown }).origin;
  if (!origin || typeof origin !== 'object') return null;
  const o = origin as { kind?: unknown; name?: unknown; body?: unknown };
  if (o.kind !== 'peer' || typeof o.body !== 'string' || !o.body.trim()) return null;
  return { name: typeof o.name === 'string' && o.name ? o.name : undefined, body: o.body.trim() };
}

/**
 * A message from another session (ported from Swttch): labelled by who sent it rather than
 * drawn as the user's own words, and without the note the CLI wraps around it for the model.
 */
export function PeerMessageCard({ origin, t }: { origin: { name?: string; body: string }; t: TFunction }) {
  return (
    <div className="peer-message" data-testid="peer-message">
      <div className="peer-message-label">
        <span className="codicon codicon-comment-discussion" aria-hidden="true" />
        <span>{t('chat.peerMessage.title')}</span>
        {origin.name && <span className="peer-message-name">· {origin.name}</span>}
      </div>
      <div className="peer-message-body">{origin.body}</div>
    </div>
  );
}
