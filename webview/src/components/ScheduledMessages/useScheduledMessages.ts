import { useCallback, useEffect, useRef, useState } from 'react';
import { sendToJava } from '../../utils/bridge';
import {
  parseScheduledList,
  parseScheduledMessage,
  type ScheduledMessage,
} from './scheduledMessages';

export interface ScheduledMessagesApi {
  /** The conversation the list belongs to; null before its first message. */
  sessionId: string | null;
  /** Its reservations, soonest first. */
  schedules: ScheduledMessage[];
  schedule: (sendAt: Date, message: string) => void;
  update: (id: string, sendAt: Date, message: string) => void;
  cancel: (id: string) => void;
}

interface Options {
  currentSessionId: string | null;
  /** The chat's own send path (queued behind a running turn), as if the user had typed it. */
  send: (message: string) => void;
  /** A request was refused; `code` names why. */
  onError: (code: string) => void;
}

/**
 * The open conversation's scheduled messages. The IDE keeps them and their clock; this asks
 * for the list whenever the conversation changes, and sends a due message it is handed when
 * it is for this conversation, then tells the IDE it went out.
 */
export function useScheduledMessages({ currentSessionId, send, onError }: Options): ScheduledMessagesApi {
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const sessionRef = useRef(currentSessionId);
  const sendRef = useRef(send);
  const onErrorRef = useRef(onError);
  const sentIds = useRef(new Set<string>());
  useEffect(() => {
    sessionRef.current = currentSessionId;
    sendRef.current = send;
    onErrorRef.current = onError;
  }, [currentSessionId, send, onError]);

  useEffect(() => {
    window.updateScheduledMessages = (json: string) => {
      const list = parseScheduledList(json);
      if (!list || list.sessionId !== sessionRef.current) return;
      setSchedules(list.schedules);
      if (list.error) onErrorRef.current(list.error);
    };
    window.deliverScheduledMessage = (json: string) => {
      const m = parseScheduledMessage(json);
      if (!m || m.sessionId !== sessionRef.current) return;
      // Handed the same reservation again (the IDE retries until it hears back): confirm, never resend.
      if (!sentIds.current.has(m.id)) {
        sentIds.current.add(m.id);
        sendRef.current(m.message);
      }
      sendToJava('scheduled_message_delivered', { id: m.id, sessionId: m.sessionId });
    };
    return () => {
      delete window.updateScheduledMessages;
      delete window.deliverScheduledMessage;
    };
  }, []);

  useEffect(() => {
    setSchedules([]);
    if (currentSessionId) {
      sendToJava('get_scheduled_messages', { sessionId: currentSessionId });
    }
  }, [currentSessionId]);

  const schedule = useCallback((sendAt: Date, message: string) => {
    if (!currentSessionId) return;
    sendToJava('schedule_message', { sessionId: currentSessionId, sendAt: sendAt.toISOString(), message });
  }, [currentSessionId]);

  const update = useCallback((id: string, sendAt: Date, message: string) => {
    if (!currentSessionId) return;
    sendToJava('update_scheduled_message', { id, sessionId: currentSessionId, sendAt: sendAt.toISOString(), message });
  }, [currentSessionId]);

  const cancel = useCallback((id: string) => {
    if (!currentSessionId) return;
    sendToJava('cancel_scheduled_message', { id, sessionId: currentSessionId });
  }, [currentSessionId]);

  return { sessionId: currentSessionId, schedules, schedule, update, cancel };
}
