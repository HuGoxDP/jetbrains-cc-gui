import { Fragment, useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SHORTCUT_GROUPS, visibleShortcuts, type ShortcutContext } from './shortcutCatalog';

interface KeyCapsProps {
  /** One entry per alternative; each alternative is the caps of one combination. */
  combos: readonly (readonly string[])[];
}

/** One cap per key, with a slash between alternatives that do the same job. */
export function KeyCaps({ combos }: KeyCapsProps) {
  return (
    <span className="shortcuts-help-keys">
      {combos.map((caps, comboIndex) => (
        <Fragment key={comboIndex}>
          {comboIndex > 0 && (
            <span aria-hidden="true" className="shortcuts-help-or">
              /
            </span>
          )}
          <span className="shortcuts-help-combo">
            {caps.map((cap, capIndex) => (
              <kbd key={capIndex} className="shortcuts-help-cap">
                {cap}
              </kbd>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

interface ShortcutsHelpDialogProps {
  context: ShortcutContext;
  onClose: () => void;
}

/**
 * Every keyboard shortcut of the chat that is true on this machine, by group.
 * The header stays put while the list scrolls, so a long list never pushes the
 * close button out of reach.
 */
export function ShortcutsHelpDialog({ context, onClose }: ShortcutsHelpDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const rows = useMemo(() => visibleShortcuts(context), [context]);

  // The dialog itself takes focus, not a field, so opening it types nothing into
  // the chat input; focus goes back where it was on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Escape is taken in the capture phase so it closes this instead of reaching
  // the chat input or a prompt underneath, which bind Escape for their own use.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="shortcuts-help-overlay"
      data-testid="shortcuts-help-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="shortcuts-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="shortcuts-help-header">
          <h3 id={titleId} className="shortcuts-help-title">
            {t('shortcutsHelp.title')}
          </h3>
          <button
            type="button"
            className="shortcuts-help-close"
            aria-label={t('shortcutsHelp.close')}
            title={t('shortcutsHelp.close')}
            onClick={onClose}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
        <div className="shortcuts-help-body">
          {SHORTCUT_GROUPS.map((meta) => {
            const groupRows = rows.filter((row) => row.group === meta.group);
            if (groupRows.length === 0) return null;
            return (
              <section key={meta.group} className="shortcuts-help-group" aria-label={t(meta.titleKey)}>
                <div className="shortcuts-help-group-title">{t(meta.titleKey)}</div>
                {meta.noteKey && <p className="shortcuts-help-note">{t(meta.noteKey)}</p>}
                <ul className="shortcuts-help-rows">
                  {groupRows.map((row) => (
                    <li key={row.id} className="shortcuts-help-row" data-shortcut-id={row.id}>
                      <span className="shortcuts-help-description">{t(row.descriptionKey)}</span>
                      <KeyCaps combos={row.combos} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
