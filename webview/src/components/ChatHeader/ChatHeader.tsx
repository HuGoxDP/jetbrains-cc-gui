import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import { BackIcon } from '../Icons';
import {
  readHeaderDock,
  reorderVisible,
  saveHeaderDock,
  toggleDocked,
  type HeaderActionId,
  type HeaderDockState,
} from '../../utils/headerDock';
import { HeaderDockMenu, type HeaderDockItem } from './HeaderDockMenu';

export interface ChatHeaderProps {
  currentView: 'chat' | 'history' | 'settings';
  sessionTitle: string;
  t: TFunction;
  onBack: () => void;
  onNewSession: () => void;
  onNewTab: () => void;
  onHistory: () => void;
  onSettings: () => void;
  /**
   * Opens the in-conversation search panel. Only rendered when provided.
   * Wired up by App.tsx via UIStateContext.setSearchOpen.
   */
  onOpenSearch?: () => void;
  /** Opens the conversation's scheduled messages. Only rendered when provided (the conversation has started). */
  onOpenScheduled?: () => void;
  /** How many messages wait to be sent in this conversation; shown on the clock button. */
  scheduledCount?: number;
  onTitleChange?: (newTitle: string) => void;
  titleEditable?: boolean;
}

export function ChatHeader({
  currentView,
  sessionTitle,
  t,
  onBack,
  onNewSession,
  onNewTab,
  onHistory,
  onSettings,
  onOpenSearch,
  onOpenScheduled,
  scheduledCount = 0,
  onTitleChange,
  titleEditable = false,
}: ChatHeaderProps): React.ReactElement | null {
  const [editing, setEditing] = useState(false);
  const [dock, setDock] = useState<HeaderDockState>(readHeaderDock);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Render-time adjustment: stop editing when the title becomes non-editable
  // (same reset the old prop-change effect performed, without an extra commit).
  if (!titleEditable && editing) {
    setEditing(false);
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = useCallback(() => {
    if (!titleEditable || !onTitleChange) return;
    setEditValue(sessionTitle);
    setEditing(true);
  }, [titleEditable, onTitleChange, sessionTitle]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim().slice(0, 50);
    if (trimmed && trimmed !== sessionTitle && onTitleChange) {
      onTitleChange(trimmed);
    }
  }, [editValue, sessionTitle, onTitleChange]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [commitEdit, cancelEdit]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    // If focus moves to save/cancel button inside edit container, let that button handle it
    const editContainer = e.currentTarget.closest('.session-title-edit-mode');
    if (editContainer && editContainer.contains(e.relatedTarget as Node)) {
      return;
    }
    commitEdit();
  }, [commitEdit]);

  const updateDock = useCallback((next: HeaderDockState) => {
    setDock(next);
    saveHeaderDock(next);
  }, []);

  if (currentView === 'settings') {
    return null;
  }

  const searchLabel = t('chat.search.openTooltip', { defaultValue: 'Search in conversation' });
  // Every header action, as the ⋮ menu lists it; null when this conversation has none.
  const actions: Record<HeaderActionId, Omit<HeaderDockItem, 'id' | 'docked'> | null> = {
    newSession: { icon: 'codicon-plus', label: t('common.newSession'), run: onNewSession },
    newTab: { icon: 'codicon-split-horizontal', label: t('common.newTab'), run: onNewTab },
    search: onOpenSearch ? { icon: 'codicon-search', label: searchLabel, run: onOpenSearch } : null,
    scheduled: onOpenScheduled
      ? { icon: 'codicon-watch', label: t('chat.scheduled.openTooltip'), badge: scheduledCount, run: onOpenScheduled }
      : null,
    history: { icon: 'codicon-history', label: t('common.history'), run: onHistory },
    settings: { icon: 'codicon-settings-gear', label: t('common.settings'), run: onSettings },
  };
  const menuItems: HeaderDockItem[] = dock.order.flatMap((id) => {
    const action = actions[id];
    return action ? [{ id, ...action, docked: dock.docked.includes(id) }] : [];
  });
  const isDocked = (id: HeaderActionId) => actions[id] !== null && dock.docked.includes(id);
  const headerButton: Record<HeaderActionId, () => React.ReactNode> = {
    newSession: () => (
      <button key="newSession" className="icon-button" onClick={onNewSession} data-tooltip={t('common.newSession')} aria-label={t('common.newSession')}>
        <span className="codicon codicon-plus" />
      </button>
    ),
    newTab: () => (
      <button
        key="newTab"
        className="icon-button"
        onClick={onNewTab}
        data-tooltip={t('common.newTab')}
        aria-label={t('common.newTab')}
      >
        <span className="codicon codicon-split-horizontal" />
      </button>
    ),
    search: () => (
      <button
        key="search"
        className="icon-button"
        onClick={onOpenSearch}
        data-tooltip={searchLabel}
        aria-label={searchLabel}
      >
        <span className="codicon codicon-search" />
      </button>
    ),
    scheduled: () => (
      <button
        key="scheduled"
        className="icon-button"
        onClick={onOpenScheduled}
        data-tooltip={t('chat.scheduled.openTooltip')}
        aria-label={scheduledCount > 0
          ? t('chat.scheduled.openTooltipCount', { n: scheduledCount })
          : t('chat.scheduled.openTooltip')}
      >
        <span className="codicon codicon-watch" />
        {scheduledCount > 0 && (
          <span className="scheduled-badge" data-testid="scheduled-badge">{scheduledCount}</span>
        )}
      </button>
    ),
    history: () => (
      <button
        key="history"
        className="icon-button"
        onClick={onHistory}
        data-tooltip={t('common.history')}
        aria-label={t('common.history')}
      >
        <span className="codicon codicon-history" />
      </button>
    ),
    settings: () => (
      <button
        key="settings"
        className="icon-button"
        onClick={onSettings}
        data-tooltip={t('common.settings')}
        aria-label={t('common.settings')}
      >
        <span className="codicon codicon-settings-gear" />
      </button>
    ),
  };

  return (
    <div className="header">
      <div className="header-left">
        {currentView === 'history' ? (
          <button className="back-button" onClick={onBack} data-tooltip={t('common.back')}>
            <BackIcon /> {t('common.back')}
          </button>
        ) : editing ? (
          <div className="session-title-edit-mode" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              className="session-title-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              maxLength={50}
              spellCheck={false}
              aria-label="Session title"
            />
            <button className="session-title-save-btn" onClick={commitEdit} aria-label="Save title">
              <span className="codicon codicon-check" />
            </button>
            <button className="session-title-cancel-btn" onClick={cancelEdit} aria-label="Cancel editing">
              <span className="codicon codicon-close" />
            </button>
          </div>
        ) : (
          <div className="session-title-wrapper">
            <div className="session-title">
              {sessionTitle}
            </div>
            {titleEditable && (
              <button className="session-title-edit-btn" onClick={startEditing} aria-label="Edit session title">
                <span className="codicon codicon-edit" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="header-right">
        {currentView === 'chat' && (
          <>
            {dock.order.filter(isDocked).map((id) => headerButton[id]())}
            <HeaderDockMenu
              items={menuItems}
              t={t}
              onToggleDocked={(id) => updateDock(toggleDocked(dock, id))}
              onReorder={(order) => updateDock(reorderVisible(dock, order))}
            />
          </>
        )}
      </div>
    </div>
  );
}
