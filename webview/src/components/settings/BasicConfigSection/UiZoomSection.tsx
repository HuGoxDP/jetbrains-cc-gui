import { useTranslation } from 'react-i18next';
import styles from './style.module.less';
import {
  UI_ZOOM_DEFAULT,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  setUiZoom,
  stepUiZoomIn,
  stepUiZoomOut,
  useUiZoom,
} from '../../../utils/uiZoom';

/**
 * The interface zoom that Ctrl/Cmd + "+", "-" and "0" adjust, as buttons, so it
 * can be found and changed without knowing the keys.
 */
const UiZoomSection = () => {
  const { t } = useTranslation();
  const level = useUiZoom();

  return (
    <div className={styles.fontSizeSection}>
      <div className={styles.fieldHeader}>
        <span className="codicon codicon-zoom-in" />
        <span className={styles.fieldLabel}>{t('settings.basic.uiZoom.label')}</span>
      </div>
      <div className={styles.stepperRow}>
        <button
          type="button"
          className={styles.stepperButton}
          onClick={() => setUiZoom(stepUiZoomOut(level))}
          disabled={level <= UI_ZOOM_MIN}
          aria-label={t('uiZoom.zoomOut')}
          title={t('uiZoom.zoomOut')}
        >
          <span className="codicon codicon-remove" />
        </button>
        <span className={styles.stepperValue} data-testid="ui-zoom-value">
          {Math.round(level * 100)}%
        </span>
        <button
          type="button"
          className={styles.stepperButton}
          onClick={() => setUiZoom(stepUiZoomIn(level))}
          disabled={level >= UI_ZOOM_MAX}
          aria-label={t('uiZoom.zoomIn')}
          title={t('uiZoom.zoomIn')}
        >
          <span className="codicon codicon-add" />
        </button>
        <button
          type="button"
          className={styles.stepperReset}
          onClick={() => setUiZoom(UI_ZOOM_DEFAULT)}
          disabled={level === UI_ZOOM_DEFAULT}
        >
          {t('uiZoom.reset')}
        </button>
      </div>
      <small className={styles.formHint}>
        <span className="codicon codicon-info" />
        <span>{t('settings.basic.uiZoom.hint')}</span>
      </small>
    </div>
  );
};

export default UiZoomSection;
