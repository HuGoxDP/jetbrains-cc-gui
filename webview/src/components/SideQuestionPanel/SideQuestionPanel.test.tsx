import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendBridgeEventMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../utils/bridge', () => ({ sendBridgeEvent: sendBridgeEventMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../MarkdownBlock', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

import { SideQuestionPanel } from '.';
import { askSideQuestion, getSideQuestion, resetSideCommandsForTests } from '../../utils/sideCommands';

function answer(payload: object) {
  const requestId = getSideQuestion()?.requestId;
  act(() => {
    window.onSideQuestionResult?.(JSON.stringify({ requestId, ...payload }));
  });
}

describe('SideQuestionPanel', () => {
  beforeEach(() => resetSideCommandsForTests());
  afterEach(() => resetSideCommandsForTests());

  it('shows nothing until a side question is asked', () => {
    const { container } = render(<SideQuestionPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the question, then the answer, and says it is not in the conversation', () => {
    render(<SideQuestionPanel />);
    act(() => askSideQuestion('what does --force skip?'));

    expect(screen.getByText('what does --force skip?')).toBeTruthy();
    expect(screen.getByText('chat.sideQuestion.thinking')).toBeTruthy();
    expect(screen.getByText('chat.sideQuestion.notInConversation')).toBeTruthy();

    answer({ ok: true, answer: { response: 'It skips the checks.' } });

    expect(screen.getByTestId('markdown').textContent).toBe('It skips the checks.');
  });

  it('says why there is no answer', () => {
    render(<SideQuestionPanel />);
    act(() => askSideQuestion('why?'));

    answer({ ok: false, reason: 'no-session' });

    expect(screen.getByText('chat.sideQuestion.errors.no-session')).toBeTruthy();
  });

  it('closes', () => {
    const { container } = render(<SideQuestionPanel />);
    act(() => askSideQuestion('why?'));

    fireEvent.click(screen.getByRole('button', { name: 'chat.sideQuestion.close' }));

    expect(container.firstChild).toBeNull();
  });
});
