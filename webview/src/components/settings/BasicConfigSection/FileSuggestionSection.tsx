import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './style.module.less';
import { sendToJava } from '../../../utils/bridge';

/** What the IDE reports about Claude Code's fileSuggestion setting. */
export interface FileSuggestionInfo {
  /** The command in the user's settings, if any. */
  command?: string | null;
  /** The project's settings file that sets its own command (it wins), if any. */
  overriddenBy?: string;
  error?: string;
}

/**
 * Claude Code's `fileSuggestion` setting (ported from Swttch): a command of the user's own
 * that builds the `@` file list. Saved in the user's settings.json for this project, the
 * same value a terminal user would write there; empty removes it.
 */
export function FileSuggestionSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<FileSuggestionInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previous = window.updateFileSuggestion;
    window.updateFileSuggestion = (json: string) => {
      try {
        const next = JSON.parse(json) as FileSuggestionInfo;
        setInfo(next);
        // A refusal keeps what was typed, so it can be corrected.
        if (!next.error) setDraft(next.command ?? '');
      } catch {
        setInfo({ error: 'Could not read the reply' });
      }
      setSaving(false);
    };
    sendToJava('get_file_suggestion', {});
    return () => {
      window.updateFileSuggestion = previous;
    };
  }, []);

  const save = () => {
    setSaving(true);
    sendToJava('set_file_suggestion', { command: draft.trim() });
  };

  return (
    <div className={styles.workingDirSection}>
      <div className={styles.fieldHeader}>
        <span className="codicon codicon-mention" />
        <span className={styles.fieldLabel}>{t('settings.basic.fileSuggestion.label')}</span>
      </div>
      <div className={styles.nodePathInputWrapper}>
        <input
          type="text"
          className={styles.nodePathInput}
          aria-label={t('settings.basic.fileSuggestion.label')}
          placeholder={t('settings.basic.fileSuggestion.placeholder')}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving && <span className="codicon codicon-loading codicon-modifier-spin" />}
          {t('common.save')}
        </button>
      </div>
      {info?.error && (
        <div className={styles.versionWarning} role="alert">
          <span className="codicon codicon-warning" />
          {info.error}
        </div>
      )}
      {info?.overriddenBy && (
        <small className={styles.formHint}>
          <span className="codicon codicon-warning" />
          <span>{t('settings.basic.fileSuggestion.overridden', { file: info.overriddenBy })}</span>
        </small>
      )}
      <small className={styles.formHint}>
        <span className="codicon codicon-info" />
        <span>{t('settings.basic.fileSuggestion.hint')}</span>
      </small>
    </div>
  );
}
