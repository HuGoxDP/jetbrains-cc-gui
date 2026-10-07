import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { SubagentHistoryResponse, SubagentInfo } from '../../types';
import { sendBridgeEvent } from '../../utils/bridge';
import { stopBackgroundTask, stopFailureKey } from '../../utils/backgroundTaskStop';
import { hasSubagentTranscript } from '../../utils/subagentResult';
import { subagentStatusIconMap } from './types';
import SubagentProcessDetails from './SubagentProcessDetails';

interface SubagentListProps {
  subagents: SubagentInfo[];
  histories?: Record<string, SubagentHistoryResponse>;
  currentSessionId?: string | null;
  currentProvider: string;
  isStreaming?: boolean;
}

interface SubagentRowProps {
  subagent: SubagentInfo;
  isExpanded: boolean;
  history: SubagentHistoryResponse | undefined;
  canLoad: boolean;
  /** Whether a stop asked for this agent is still out. */
  stopping: boolean;
  /** Present only where a running background agent can be stopped and written to. */
  controls?: {
    onStop: (subagent: SubagentInfo) => void;
    onMessage: (subagent: SubagentInfo) => void;
  };
  onToggle: (id: string) => void;
  t: TFunction;
}

const SubagentRow = memo(({ subagent, isExpanded, history, canLoad, stopping, controls, onToggle, t }: SubagentRowProps) => {
  const statusIcon = subagentStatusIconMap[subagent.status] ?? 'codicon-circle-outline';
  const statusClass = `status-${subagent.status}`;
  const agentId = history?.agentId ?? subagent.agentId;
  const name = subagent.description || subagent.type || t('statusPanel.subagentTab');

  const handleClick = useCallback(() => {
    onToggle(subagent.id);
  }, [onToggle, subagent.id]);

  return (
    <div className={`subagent-item-wrapper ${statusClass}`}>
      <div className="subagent-item-row">
        <button
          type="button"
          className={`subagent-item ${statusClass}`}
          onClick={handleClick}
        >
          <span className={`subagent-status-icon ${statusClass}`}>
            <span className={`codicon ${statusIcon}`} />
          </span>
          <span className="subagent-type">{subagent.type || t('statusPanel.subagentTab')}</span>
          <span className="subagent-description" title={subagent.prompt}>
            {subagent.description || subagent.prompt?.slice(0, 50)}
          </span>
          <span className={`subagent-chevron codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
        </button>
        {controls && (
          <span className="subagent-actions">
            {/* Writing to an agent needs its runtime id, which arrives with its launch result. */}
            {agentId && (
              <button
                type="button"
                className="subagent-action"
                title={t('statusPanel.messageAgent')}
                aria-label={t('statusPanel.messageAgentNamed', { name })}
                onClick={() => controls.onMessage({ ...subagent, agentId })}
              >
                <span className="codicon codicon-comment" />
              </button>
            )}
            <button
              type="button"
              className="subagent-action subagent-action-stop"
              title={stopping ? t('statusPanel.stoppingAgent') : t('statusPanel.stopAgent')}
              aria-label={t('statusPanel.stopAgentNamed', { name })}
              disabled={stopping}
              onClick={() => controls.onStop({ ...subagent, ...(agentId ? { agentId } : {}) })}
            >
              <span className={`codicon ${stopping ? 'codicon-loading codicon-modifier-spin' : 'codicon-debug-stop'}`} />
            </button>
          </span>
        )}
      </div>

      {isExpanded && (
        <SubagentProcessDetails
          agentId={history?.agentId ?? subagent.agentId}
          totalDurationMs={subagent.totalDurationMs}
          totalTokens={subagent.totalTokens}
          totalToolUseCount={subagent.totalToolUseCount}
          resultText={subagent.resultText}
          prompt={subagent.prompt}
          history={history}
          canLoad={canLoad}
        />
      )}
    </div>
  );
});

SubagentRow.displayName = 'SubagentRow';
const EMPTY_HISTORIES: SubagentListProps['histories'] = {};

const SubagentList = memo(({ subagents, histories = EMPTY_HISTORIES, currentSessionId, currentProvider }: SubagentListProps) => {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Keep latest subagents/histories in refs so the polling effect can read fresh
  // values without re-running (and rebuilding the interval) on every change.
  const subagentsRef = useRef(subagents);
  const historiesRef = useRef(histories);
  useEffect(() => { subagentsRef.current = subagents; }, [subagents]);
  useEffect(() => { historiesRef.current = histories; }, [histories]);

  const requestHistory = useCallback((subagent: SubagentInfo) => {
    if (!currentSessionId) return;
    const history = historiesRef.current[subagent.id]
      ?? (subagent.agentId ? historiesRef.current[subagent.agentId] : undefined);
    sendBridgeEvent('load_subagent_session', JSON.stringify({
      sessionId: currentSessionId,
      provider: currentProvider,
      agentId: history?.agentId ?? subagent.agentId,
      agentPath: history?.agentPath ?? subagent.agentPath,
      description: subagent.description,
      toolUseId: subagent.id,
    }));
  }, [currentProvider, currentSessionId]);

  // Track the expanded row's status so the polling effect re-runs (and clears
  // its interval) when it transitions out of "running", instead of leaving a
  // no-op interval firing every 2 s until the row is collapsed.
  const expandedStatus = subagents.find((item) => item.id === expandedId)?.status;

  useEffect(() => {
    if (!expandedId) return;
    const subagent = subagentsRef.current.find((item) => item.id === expandedId);
    if (!subagent || !currentSessionId) return;
    const history = historiesRef.current[expandedId]
      ?? (subagent.agentId ? historiesRef.current[subagent.agentId] : undefined);
    if (!hasSubagentTranscript(history)) {
      requestHistory(subagent);
    }
    if (!currentSessionId || subagent.status !== 'running') return;
    const timer = window.setInterval(() => {
      const current = subagentsRef.current.find((item) => item.id === expandedId);
      if (!current || current.status !== 'running') return;
      requestHistory(current);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [currentSessionId, expandedId, requestHistory, expandedStatus]);

  const historyById = useMemo(() => histories, [histories]);

  const handleToggleRow = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const canLoad = Boolean(currentSessionId);

  // Background agents being stopped, until the stop is refused or the agent
  // stops running (its task_notification arrives) — or a while after the stop
  // was taken, should that notification never come.
  const [stoppingIds, setStoppingIds] = useState<ReadonlySet<string>>(() => new Set());
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const clearStopping = useCallback((id: string) => {
    if (!mountedRef.current) return;
    setStoppingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleStop = useCallback((subagent: SubagentInfo) => {
    setStoppingIds((prev) => new Set(prev).add(subagent.id));
    void stopBackgroundTask(subagent.id, subagent.agentId).then((result) => {
      if (!result.stopped) {
        clearStopping(subagent.id);
        window.addToast?.(t(stopFailureKey(result.error), { error: result.error ?? '' }), 'error');
        return;
      }
      window.setTimeout(() => clearStopping(subagent.id), 15_000);
    });
  }, [clearStopping, t]);

  // Talking to a background agent goes through Claude, as in the CLI: the
  // request is put into the chat input for the user to finish and send, and
  // Claude passes it on with SendMessage. Nothing is sent without the user.
  const handleMessage = useCallback((subagent: SubagentInfo) => {
    if (!subagent.agentId) return;
    const name = subagent.description || subagent.type || t('statusPanel.subagentTab');
    window.insertCodeSnippetAtCursor?.(t('statusPanel.messageAgentPrefix', { name, agentId: subagent.agentId }));
    window.focusChatInput?.();
  }, [t]);

  const controls = useMemo(
    () => (currentProvider === 'claude' ? { onStop: handleStop, onMessage: handleMessage } : undefined),
    [currentProvider, handleMessage, handleStop],
  );

  if (subagents.length === 0) {
    return <div className="status-panel-empty">{t('statusPanel.noSubagents')}</div>;
  }

  return (
    <div className="subagent-list">
      {subagents.map((subagent, index) => {
        const history = historyById[subagent.id] ?? (subagent.agentId ? historyById[subagent.agentId] : undefined);
        // Index fallback guards against rare cases where the bridge emits a
        // subagent without a stable id; without it React surfaces a duplicate-key
        // warning and may miscompare rows during streaming updates.
        return (
          <SubagentRow
            key={subagent.id ?? `subagent-${index}`}
            subagent={subagent}
            isExpanded={expandedId === subagent.id}
            history={history}
            canLoad={canLoad}
            stopping={stoppingIds.has(subagent.id)}
            controls={subagent.isAsync && subagent.status === 'running' ? controls : undefined}
            onToggle={handleToggleRow}
            t={t}
          />
        );
      })}
    </div>
  );
});

SubagentList.displayName = 'SubagentList';

export default SubagentList;
