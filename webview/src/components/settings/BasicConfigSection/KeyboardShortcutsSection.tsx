import { useTranslation } from 'react-i18next';
import styles from './style.module.less';
import { openShortcutsHelp } from '../../ShortcutsHelp/ShortcutsHelpHost';

/** Opens the keyboard shortcuts window, so it can be found without knowing Cmd/Ctrl+/. */
const KeyboardShortcutsSection = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.fontSizeSection}>
      <div className={styles.fieldHeader}>
        <span className="codicon codicon-record-keys" />
        <span className={styles.fieldLabel}>{t('settings.basic.keyboardShortcuts.label')}</span>
      </div>
      <div className={styles.stepperRow}>
        <button type="button" className={styles.sectionLinkButton} onClick={openShortcutsHelp}>
          {t('settings.basic.keyboardShortcuts.show')}
        </button>
      </div>
      <small className={styles.formHint}>
        <span className="codicon codicon-info" />
        <span>{t('settings.basic.keyboardShortcuts.hint')}</span>
      </small>
    </div>
  );
};

export default KeyboardShortcutsSection;
