import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatHeader } from './ChatHeader';
import { ScheduledMessagesDialog } from './ScheduledMessages/ScheduledMessagesDialog';
import type { ScheduledMessagesApi } from './ScheduledMessages/useScheduledMessages';
import { sendBridgeEvent } from '../utils/bridge';
import { useSession } from '../contexts/SessionContext';
import { useUIState } from '../contexts/UIStateContext';

interface AppHeaderProps {
  sessionTitle: string;
  onNewSession: () => void;
  onUpdateHistoryTitle: (sessionId: string, newTitle: string) => void;
  /** The conversation's scheduled messages (send later). */
  scheduled?: ScheduledMessagesApi;
  /** What is typed in the chat input; a new scheduled message starts from it. */
  getDraft?: () => string;
}

/**
 * Header region extracted from App.tsx — wires view navigation, session
 * actions, and inline title editing into ChatHeader. View/session state is
 * consumed from contexts directly (same convention as ChatScreen).
 */
export const AppHeader = ({ sessionTitle, onNewSession, onUpdateHistoryTitle, scheduled, getDraft }: AppHeaderProps) => {
  const { t } = useTranslation();
  const {
    currentView, setCurrentView,
    setSettingsInitialTab, setSettingsProviderSubTab,
    setSearchOpen,
  } = useUIState();
  const { currentSessionId, setCustomSessionTitle } = useSession();
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const canSchedule = Boolean(scheduled?.sessionId);

  return (
    <>
      <ChatHeader
        currentView={currentView}
        sessionTitle={sessionTitle}
        t={t}
        onBack={() => setCurrentView('chat')}
        onNewSession={onNewSession}
        onNewTab={() => sendBridgeEvent('create_new_tab')}
        onHistory={() => setCurrentView('history')}
        onSettings={() => {
          setSettingsInitialTab(undefined);
          setSettingsProviderSubTab(undefined);
          setCurrentView('settings');
        }}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenScheduled={canSchedule ? () => setScheduledOpen(true) : undefined}
        scheduledCount={scheduled?.schedules.length ?? 0}
        titleEditable
        onTitleChange={(newTitle) => {
          setCustomSessionTitle(newTitle);
          if (currentSessionId) {
            onUpdateHistoryTitle(currentSessionId, newTitle);
          }
        }}
      />
      {scheduledOpen && scheduled && canSchedule && (
        <ScheduledMessagesDialog
          api={scheduled}
          getDraft={getDraft ?? (() => '')}
          onClose={() => setScheduledOpen(false)}
        />
      )}
    </>
  );
};
