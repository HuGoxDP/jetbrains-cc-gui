import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './style.module.less';
import { sendToJava } from '../../../utils/bridge';

/** What the IDE reports: both values, and the folder that applies to this project and why. */
export interface ClaudeConfigDirInfo {
  hasProject?: boolean;
  globalValue?: string;
  projectValue?: string;
  effective?: string;
  source?: 'project' | 'global' | 'environment' | 'default';
  /** Set when the value comes from a project this one is inside of. */
  fromProject?: string;
  error?: string;
}

type Scope = 'global' | 'project';

/**
 * CLAUDE_CONFIG_DIR (ported from Swttch): the folder Claude keeps its settings, login
 * and session history in, for all projects and for this one. The IDE hands it to every
 * Claude process it starts, as a terminal user would export it.
 */
export function ClaudeConfigDirSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ClaudeConfigDirInfo | null>(null);
  const [drafts, setDrafts] = useState<Record<Scope, string>>({ global: '', project: '' });
  const [saving, setSaving] = useState<Scope | null>(null);

  useEffect(() => {
    const previous = window.updateClaudeConfigDir;
    window.updateClaudeConfigDir = (json: string) => {
      try {
        const next = JSON.parse(json) as ClaudeConfigDirInfo;
        setInfo(next);
        // A refusal keeps what was typed, so it can be corrected.
        if (!next.error && (next.globalValue !== undefined || next.projectValue !== undefined)) {
          setDrafts({ global: next.globalValue ?? '', project: next.projectValue ?? '' });
        }
      } catch {
        setInfo({ error: 'Could not read the reply' });
      }
      setSaving(null);
    };
    sendToJava('get_claude_config_dir', {});
    return () => {
      window.updateClaudeConfigDir = previous;
    };
  }, []);

  const save = (scope: Scope) => {
    setSaving(scope);
    sendToJava('set_claude_config_dir', { scope, value: drafts[scope].trim() });
  };

  const sourceText = () => {
    if (!info?.source) return '';
    if (info.source === 'project' && info.fromProject) {
      return t('settings.basic.claudeConfigDir.source.parentProject', { project: info.fromProject });
    }
    return t(`settings.basic.claudeConfigDir.source.${info.source}`);
  };

  const row = (scope: Scope) => {
    const disabled = scope === 'project' && info?.hasProject === false;
    return (
      <div className={styles.nodePathInputWrapper}>
        <input
          type="text"
          className={styles.nodePathInput}
          aria-label={t(`settings.basic.claudeConfigDir.${scope === 'global' ? 'allProjects' : 'thisProject'}`)}
          placeholder={t(`settings.basic.claudeConfigDir.${scope === 'global' ? 'placeholderAll' : 'placeholderProject'}`)}
          value={drafts[scope]}
          disabled={disabled}
          onChange={(e) => setDrafts((d) => ({ ...d, [scope]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save(scope);
            }
          }}
        />
        <button className={styles.saveBtn} onClick={() => save(scope)} disabled={disabled || saving !== null}>
          {saving === scope && <span className="codicon codicon-loading codicon-modifier-spin" />}
          {t('common.save')}
        </button>
      </div>
    );
  };

  return (
    <div className={styles.workingDirSection}>
      <div className={styles.fieldHeader}>
        <span className="codicon codicon-gear" />
        <span className={styles.fieldLabel}>CLAUDE_CONFIG_DIR</span>
      </div>
      <small className={styles.formHint}>
        <span>{t('settings.basic.claudeConfigDir.allProjects')}</span>
      </small>
      {row('global')}
      <small className={styles.formHint}>
        <span>
          {info?.hasProject === false ? t('settings.basic.claudeConfigDir.noProject') : t('settings.basic.claudeConfigDir.thisProject')}
        </span>
      </small>
      {row('project')}
      {info?.error && (
        <div className={styles.versionWarning} role="alert">
          <span className="codicon codicon-warning" />
          {info.error}
        </div>
      )}
      {info?.effective && (
        <small className={styles.formHint}>
          <span className="codicon codicon-folder" />
          <span>
            {t('settings.basic.claudeConfigDir.inUse')} <code>{info.effective}</code> ({sourceText()})
          </span>
        </small>
      )}
      <small className={styles.formHint}>
        <span className="codicon codicon-info" />
        <span>{t('settings.basic.claudeConfigDir.hint')}</span>
      </small>
    </div>
  );
}
