import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubagentHistoryResponse, SubagentInfo } from '../../types';
import SubagentList from './SubagentList';

const sendBridgeEventMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/bridge', () => ({ sendBridgeEvent: sendBridgeEventMock }));
const stopBackgroundTaskMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/backgroundTaskStop', () => ({
  stopBackgroundTask: stopBackgroundTaskMock,
  stopFailureKey: (error?: string) => `failure:${error}`,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

describe('SubagentList', () => {
  it('loads Codex history with provider and agent path', async () => {
    const subagent: SubagentInfo = {
      id: 'call-spawn',
      type: 'audit',
      description: 'Review anchors',
      prompt: 'Review anchors',
      status: 'running',
      isAsync: true,
      messageIndex: 0,
      agentPath: 'audit_ui',
    };

    render(
      <SubagentList
        subagents={[subagent]}
        currentSessionId="session-1"
        currentProvider="codex"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(sendBridgeEventMock).toHaveBeenCalledWith(
      'load_subagent_session',
      JSON.stringify({
        sessionId: 'session-1',
        provider: 'codex',
        agentPath: 'audit_ui',
        description: 'Review anchors',
        toolUseId: 'call-spawn',
      }),
    ));
  });

  it('loads the full transcript when only a lightweight status snapshot exists', async () => {
    const subagent: SubagentInfo = {
      id: 'call-spawn',
      type: 'audit',
      description: 'Review anchors',
      status: 'running',
      isAsync: true,
      messageIndex: 0,
      agentPath: 'audit_ui',
    };
    const histories: Record<string, SubagentHistoryResponse> = {
      'call-spawn': {
        success: true,
        completed: false,
        status: 'running',
        toolUseId: 'call-spawn',
        agentId: 'agent-resolved',
        agentPath: '/root/audit_ui',
      },
    };

    render(
      <SubagentList
        subagents={[subagent]}
        histories={histories}
        currentSessionId="session-1"
        currentProvider="codex"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(sendBridgeEventMock).toHaveBeenCalledWith(
      'load_subagent_session',
      JSON.stringify({
        sessionId: 'session-1',
        provider: 'codex',
        agentId: 'agent-resolved',
        agentPath: '/root/audit_ui',
        description: 'Review anchors',
        toolUseId: 'call-spawn',
      }),
    ));
  });

  describe('a running background agent of the Claude provider', () => {
    const running: SubagentInfo = {
      id: 'toolu_bg',
      type: 'Explore',
      description: 'Map the parser',
      prompt: 'Map the parser',
      status: 'running',
      isAsync: true,
      messageIndex: 0,
      agentId: 'a1b2c3d',
    };

    it('can be stopped, and the button waits while the stop is out', async () => {
      let settle: (result: { stopped: boolean; error?: string }) => void = () => {};
      stopBackgroundTaskMock.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
      render(<SubagentList subagents={[running]} currentSessionId="s" currentProvider="claude" />);

      const stop = screen.getByLabelText(/statusPanel.stopAgentNamed/) as HTMLButtonElement;
      fireEvent.click(stop);

      expect(stopBackgroundTaskMock).toHaveBeenCalledWith('toolu_bg', 'a1b2c3d');
      expect(stop.disabled).toBe(true);
      settle({ stopped: true });
    });

    it('says why when the stop is refused, and offers the button again', async () => {
      stopBackgroundTaskMock.mockResolvedValueOnce({ stopped: false, error: 'unsupported' });
      const addToast = vi.fn();
      window.addToast = addToast;
      render(<SubagentList subagents={[running]} currentSessionId="s" currentProvider="claude" />);

      const stop = screen.getByLabelText(/statusPanel.stopAgentNamed/) as HTMLButtonElement;
      fireEvent.click(stop);

      await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.stringContaining('failure:unsupported'), 'error'));
      expect(stop.disabled).toBe(false);
      delete window.addToast;
    });

    it('puts a request to the agent into the chat input for the user to finish', () => {
      const insert = vi.fn();
      window.insertCodeSnippetAtCursor = insert;
      render(<SubagentList subagents={[running]} currentSessionId="s" currentProvider="claude" />);

      fireEvent.click(screen.getByLabelText(/statusPanel.messageAgentNamed/));

      expect(insert).toHaveBeenCalledWith(expect.stringContaining('"agentId":"a1b2c3d"'));
      expect(insert).toHaveBeenCalledWith(expect.stringContaining('statusPanel.messageAgentPrefix'));
      expect(sendBridgeEventMock).not.toHaveBeenCalledWith('stop_background_task', expect.anything());
      delete window.insertCodeSnippetAtCursor;
    });

    it('offers no message button before the agent id is known', () => {
      render(<SubagentList subagents={[{ ...running, agentId: undefined }]} currentSessionId="s" currentProvider="claude" />);

      expect(screen.queryByLabelText(/statusPanel.messageAgentNamed/)).toBeNull();
      expect(screen.getByLabelText(/statusPanel.stopAgentNamed/)).toBeTruthy();
    });

    it('offers neither once the agent has finished, nor for a foreground agent, nor for another provider', () => {
      const { rerender } = render(
        <SubagentList subagents={[{ ...running, status: 'completed' }]} currentSessionId="s" currentProvider="claude" />,
      );
      expect(screen.queryByLabelText(/statusPanel.stopAgentNamed/)).toBeNull();

      rerender(<SubagentList subagents={[{ ...running, isAsync: false }]} currentSessionId="s" currentProvider="claude" />);
      expect(screen.queryByLabelText(/statusPanel.stopAgentNamed/)).toBeNull();

      rerender(<SubagentList subagents={[running]} currentSessionId="s" currentProvider="codex" />);
      expect(screen.queryByLabelText(/statusPanel.stopAgentNamed/)).toBeNull();
    });
  });
});
