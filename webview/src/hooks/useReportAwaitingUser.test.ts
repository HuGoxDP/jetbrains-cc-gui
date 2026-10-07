import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendBridgeEventMock = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  loading: false,
  permissionDialogOpen: false,
  askUserQuestionDialogOpen: false,
  planApprovalDialogOpen: false,
}));

vi.mock('../utils/bridge', () => ({ sendBridgeEvent: sendBridgeEventMock }));
vi.mock('../contexts/MessagesContext', () => ({ useMessages: () => ({ loading: state.loading }) }));
vi.mock('../contexts/DialogContext', () => ({
  useDialogs: () => ({
    permissionDialogOpen: state.permissionDialogOpen,
    askUserQuestionDialogOpen: state.askUserQuestionDialogOpen,
    planApprovalDialogOpen: state.planApprovalDialogOpen,
  }),
}));

import { useReportAwaitingUser } from './useReportAwaitingUser';

function statuses(): string[] {
  return sendBridgeEventMock.mock.calls
    .filter((call) => call[0] === 'tab_status_changed')
    .map((call) => JSON.parse(call[1] as string).status as string);
}

beforeEach(() => {
  sendBridgeEventMock.mockClear();
  Object.assign(state, { loading: false, permissionDialogOpen: false, askUserQuestionDialogOpen: false, planApprovalDialogOpen: false });
});

/** A reply that stops on a prompt says so, and says when it goes on. */
describe('useReportAwaitingUser', () => {
  it('reports waiting while a prompt is open during a reply, and answering once it is answered', () => {
    state.loading = true;
    const { rerender } = renderHook(() => useReportAwaitingUser());
    expect(statuses()).toEqual([]);

    state.permissionDialogOpen = true;
    rerender();
    expect(statuses()).toEqual(['waiting']);

    state.permissionDialogOpen = false;
    rerender();
    expect(statuses()).toEqual(['waiting', 'answering']);
  });

  it('counts a question and a plan to approve as waiting too', () => {
    state.loading = true;
    state.askUserQuestionDialogOpen = true;
    const { rerender } = renderHook(() => useReportAwaitingUser());
    state.askUserQuestionDialogOpen = false;
    state.planApprovalDialogOpen = true;
    rerender();
    expect(statuses()).toEqual(['waiting']);
  });

  it('says nothing about a prompt outside a reply, and nothing more when the reply ends', () => {
    state.permissionDialogOpen = true;
    const { rerender } = renderHook(() => useReportAwaitingUser());
    expect(statuses()).toEqual([]);

    state.loading = true;
    rerender();
    expect(statuses()).toEqual(['waiting']);

    state.loading = false;
    rerender();
    // The end of the reply is reported by the stream itself (completed).
    expect(statuses()).toEqual(['waiting']);
  });
});
