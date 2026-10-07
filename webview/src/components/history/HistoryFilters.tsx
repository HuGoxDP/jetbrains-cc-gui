import { memo } from 'react';
import type { TFunction } from 'i18next';

export interface HistoryFiltersProps {
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Whether only the sessions open in a tab are listed. */
  activeOnly?: boolean;
  /** How many listed sessions are open in a tab. */
  activeCount?: number;
  onToggleActiveOnly?: () => void;
  t: TFunction;
}

export const HistoryFilters = memo(({ inputValue, onInputChange, activeOnly = false, activeCount = 0, onToggleActiveOnly, t }: HistoryFiltersProps) => {
  return (
    <div className="history-filters-row">
      <div className="history-search-container">
        <input
          type="text"
          className="history-search-input"
          placeholder={t('history.searchPlaceholder')}
          value={inputValue}
          onChange={onInputChange}
        />
        <span className="codicon codicon-search history-search-icon"></span>
      </div>
      {onToggleActiveOnly && (
        <button
          type="button"
          className={`history-active-filter ${activeOnly ? 'on' : ''}`}
          aria-pressed={activeOnly}
          title={t('history.activeFilterHint')}
          onClick={onToggleActiveOnly}
        >
          <span className="codicon codicon-pulse" />
          <span>{t('history.activeFilter', { count: activeCount })}</span>
        </button>
      )}
    </div>
  );
});

HistoryFilters.displayName = 'HistoryFilters';
