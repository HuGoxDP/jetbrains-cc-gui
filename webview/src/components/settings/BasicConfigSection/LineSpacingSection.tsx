import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './style.module.less';
import {
  CHAT_LINE_HEIGHT_DEFAULT,
  CHAT_LINE_HEIGHT_MAX,
  CHAT_LINE_HEIGHT_MIN,
  CHAT_LINE_HEIGHT_STEP,
  normalizeChatLineHeight,
  setChatLineHeight,
  useChatLineHeight,
} from '../../../utils/chatLineHeight';

/** Line spacing of the text in chat messages (utils/chatLineHeight.ts). */
const LineSpacingSection = () => {
  const { t } = useTranslation();
  const value = useChatLineHeight();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  // An empty or unreadable field puts the value back rather than saving nothing.
  const commit = () => {
    const next = draft.trim() === '' ? null : normalizeChatLineHeight(Number(draft));
    if (next === null) {
      setDraft(String(value));
      return;
    }
    setChatLineHeight(next);
    setDraft(String(next));
  };

  return (
    <div className={styles.fontSizeSection}>
      <div className={styles.fieldHeader}>
        <span className="codicon codicon-list-flat" />
        <span className={styles.fieldLabel}>{t('settings.basic.lineSpacing.label')}</span>
      </div>
      <div className={`${styles.nodePathInputWrapper} ${styles.timeoutInputWrapper}`}>
        <input
          type="number"
          className={styles.nodePathInput}
          aria-label={t('settings.basic.lineSpacing.label')}
          min={CHAT_LINE_HEIGHT_MIN}
          max={CHAT_LINE_HEIGHT_MAX}
          step={CHAT_LINE_HEIGHT_STEP}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        <button
          type="button"
          className={styles.stepperReset}
          onClick={() => setChatLineHeight(CHAT_LINE_HEIGHT_DEFAULT)}
          disabled={value === CHAT_LINE_HEIGHT_DEFAULT}
        >
          {t('settings.basic.lineSpacing.reset')}
        </button>
      </div>
      <small className={styles.formHint}>
        <span className="codicon codicon-info" />
        <span>{t('settings.basic.lineSpacing.hint')}</span>
      </small>
    </div>
  );
};

export default LineSpacingSection;
