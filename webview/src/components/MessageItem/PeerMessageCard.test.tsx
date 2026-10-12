import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PeerMessageCard, peerOrigin } from './PeerMessageCard';
import type { ClaudeMessage } from '../../types';

const t = ((key: string) => key) as never;

function userWith(origin: unknown): ClaudeMessage {
  return {
    type: 'user',
    content: '<agent-message>wrapped</agent-message>',
    raw: { type: 'user', origin, message: { role: 'user', content: 'wrapped' } } as never,
  };
}

describe('a message from another session', () => {
  it('is read from the origin the CLI records with it', () => {
    expect(peerOrigin(userWith({ kind: 'peer', name: 'docs-7', body: '  Tests pass on my side.\n' })))
      .toEqual({ name: 'docs-7', body: 'Tests pass on my side.' });
    expect(peerOrigin(userWith({ kind: 'peer', body: 'hi' }))).toEqual({ name: undefined, body: 'hi' });
  });

  it('is not a task notification, an empty message, or an ordinary one', () => {
    expect(peerOrigin(userWith({ kind: 'task-notification' }))).toBeNull();
    expect(peerOrigin(userWith({ kind: 'peer', body: '   ' }))).toBeNull();
    expect(peerOrigin(userWith(undefined))).toBeNull();
    expect(peerOrigin({ type: 'user', content: 'hi', raw: 'hi' })).toBeNull();
    expect(peerOrigin({ ...userWith({ kind: 'peer', body: 'x' }), type: 'assistant' })).toBeNull();
    // The chat shows non-human entries as notifications; the card still applies.
    expect(peerOrigin({ ...userWith({ kind: 'peer', body: 'x' }), type: 'notification' })).toEqual({ name: undefined, body: 'x' });
  });

  it('shows who sent it and the words, not the note wrapped around them', () => {
    render(<PeerMessageCard origin={{ name: 'docs-7', body: 'Tests pass on my side.' }} t={t} />);
    expect(screen.getByText('chat.peerMessage.title')).toBeTruthy();
    expect(screen.getByText('· docs-7')).toBeTruthy();
    expect(screen.getByText('Tests pass on my side.')).toBeTruthy();
  });
});
