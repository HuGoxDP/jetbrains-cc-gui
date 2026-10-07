import { useEffect, useRef } from 'react';
import { useDialogs } from '../contexts/DialogContext';
import { useMessages } from '../contexts/MessagesContext';
import { sendBridgeEvent } from '../utils/bridge';

/**
 * Tell the plugin when a reply stops on a prompt the user has to answer (a tool
 * permission, a question, a plan to approve), and when it goes on. The tab then
 * wears a waiting dot instead of the spinner, and the history list marks the
 * session as waiting (session activity markers, ported from Swttch).
 *
 * The start and end of a reply are already reported (tab_loading_changed,
 * tab_status_changed "completed"); this adds only the wait in between. Nothing
 * is reported while no reply is in progress, so a prompt cannot leave a tab
 * that has finished looking busy.
 */
export function useReportAwaitingUser(): void {
  const { permissionDialogOpen, askUserQuestionDialogOpen, planApprovalDialogOpen } = useDialogs();
  const { loading } = useMessages();
  const awaiting = loading && (permissionDialogOpen || askUserQuestionDialogOpen || planApprovalDialogOpen);
  const reported = useRef(false);

  useEffect(() => {
    if (awaiting === reported.current) return;
    reported.current = awaiting;
    if (awaiting) {
      sendBridgeEvent('tab_status_changed', JSON.stringify({ status: 'waiting' }));
    } else if (loading) {
      // Answered, and the reply goes on.
      sendBridgeEvent('tab_status_changed', JSON.stringify({ status: 'answering' }));
    }
  }, [awaiting, loading]);
}
