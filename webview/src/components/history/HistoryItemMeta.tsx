import type { TFunction } from 'i18next';
import type { HistorySessionSummary } from '../../types';
import { formatFileSize, highlightText } from './historyItemUtils';
import { HistoryEntrypointBadge } from './HistoryEntrypointBadge';
import { HistorySessionIdCopy } from './HistorySessionIdCopy';
import { HistoryConvertButton } from './HistoryConvertButton';

// Entrypoints the backend conversion service actually knows how to rewrite
// (SessionConversionService only matches sdk-cli / claude-vscode patterns).
const CONVERTIBLE_ENTRYPOINTS = new Set(['sdk-cli', 'claude-vscode']);

export interface HistoryItemMetaProps {
  session: HistorySessionSummary;
  isCopied: boolean;
  isCopyFailed: boolean;
  isActiveSession: boolean;
  /**
   * The nested project the session belongs to ("Include nested"). On this line rather
   * than one of its own, since every row of the virtual list is the same height.
   */
  projectLabel?: string | null;
  searchQuery?: string;
  t: TFunction;
  onCopySessionId: (sessionId: string) => void;
  onConvertToCliSession: (sessionId: string) => void;
}

export const HistoryItemMeta = ({
  session,
  isCopied,
  isCopyFailed,
  isActiveSession,
  projectLabel,
  searchQuery = '',
  t,
  onCopySessionId,
  onConvertToCliSession,
}: HistoryItemMetaProps) => {
  const fileSize = session.fileSize ? formatFileSize(session.fileSize) : null;
  const entrypoint = session.entrypoint && session.entrypoint !== 'cli' && session.entrypoint !== 'remote'
    ? session.entrypoint
    : null;
  // Converting the session this window is still chatting in would race with the
  // SDK process appending to the jsonl file, so hide the button for it.
  // A nested project's session is not offered either: the conversion looks only in the
  // open project's folder.
  const showConvertButton = !isActiveSession
    && !session.projectPath
    && session.entrypoint != null
    && CONVERTIBLE_ENTRYPOINTS.has(session.entrypoint);

  return (
    <div className="history-item-meta">
      {projectLabel ? (
        <>
          <span className="history-item-project" title={session.projectPath}>
            <span className="codicon codicon-folder" />
            <span>{highlightText(projectLabel, searchQuery)}</span>
          </span>
          <span className="history-meta-dot">•</span>
        </>
      ) : null}
      <span>{t('history.messageCount', { count: session.messageCount })}</span>
      {fileSize ? (
        <>
          <span className="history-meta-dot">•</span>
          <span className={fileSize.isMB ? 'history-filesize-large' : ''}>{fileSize.text}</span>
        </>
      ) : null}
      {entrypoint ? <HistoryEntrypointBadge entrypoint={entrypoint} t={t} /> : null}
      <HistorySessionIdCopy
        sessionId={session.sessionId}
        isCopied={isCopied}
        isCopyFailed={isCopyFailed}
        t={t}
        onCopySessionId={onCopySessionId}
      />
      {showConvertButton && session.entrypoint ? (
        <HistoryConvertButton
          sessionId={session.sessionId}
          entrypoint={session.entrypoint}
          t={t}
          onConvertToCliSession={onConvertToCliSession}
        />
      ) : null}
    </div>
  );
};
