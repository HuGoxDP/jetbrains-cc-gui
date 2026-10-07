import { memo } from 'react';
import type { TFunction } from 'i18next';
import { HistoryActions } from './HistoryActions';
import { HistoryFilters } from './HistoryFilters';

export interface HistoryHeaderProps {
  isSelectionMode: boolean;
  selectedCount: number;
  infoBar: string;
  allVisibleSelected: boolean;
  visibleCount: number;
  isDeepSearching: boolean;
  inputValue: string;
  /** Whether only the sessions open in a tab are listed. */
  activeOnly: boolean;
  /** How many listed sessions are open in a tab. */
  activeCount: number;
  onToggleActiveOnly: () => void;
  t: TFunction;
  onEnterSelectionMode: () => void;
  onExitSelectionMode: () => void;
  onToggleSelectAllVisible: () => void;
  onStartDeleteSelected: () => void;
  onDeepSearch: () => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const HistoryHeader = memo(({
  isSelectionMode,
  selectedCount,
  infoBar,
  allVisibleSelected,
  visibleCount,
  isDeepSearching,
  inputValue,
  activeOnly,
  activeCount,
  onToggleActiveOnly,
  t,
  onEnterSelectionMode,
  onExitSelectionMode,
  onToggleSelectAllVisible,
  onStartDeleteSelected,
  onDeepSearch,
  onInputChange,
}: HistoryHeaderProps) => {
  return (
    <div className="history-header">
      <div className="history-header-main">
        {isSelectionMode ? (
          <div className="history-selection-summary">
            {t('history.selectedSessions', { count: selectedCount })}
          </div>
        ) : (
          <div className="history-info">{infoBar}</div>
        )}
        <HistoryActions
          isSelectionMode={isSelectionMode}
          selectedCount={selectedCount}
          visibleCount={visibleCount}
          allVisibleSelected={allVisibleSelected}
          isDeepSearching={isDeepSearching}
          t={t}
          onEnterSelectionMode={onEnterSelectionMode}
          onExitSelectionMode={onExitSelectionMode}
          onToggleSelectAllVisible={onToggleSelectAllVisible}
          onStartDeleteSelected={onStartDeleteSelected}
          onDeepSearch={onDeepSearch}
        />
      </div>
      {!isSelectionMode && (
        <HistoryFilters
          inputValue={inputValue}
          onInputChange={onInputChange}
          activeOnly={activeOnly}
          activeCount={activeCount}
          onToggleActiveOnly={onToggleActiveOnly}
          t={t}
        />
      )}
    </div>
  );
});

HistoryHeader.displayName = 'HistoryHeader';
