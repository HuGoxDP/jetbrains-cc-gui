import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSettingSection } from './ToggleSettingSection';
import { UI_DIRECTION_EVENT, readUiDirection, setUiDirection } from '../../../utils/uiDirection';

/**
 * Right-to-left layout (ported from Swttch). Picking Persian or Arabic turns it on and a
 * left-to-right language turns it off; the switch follows that, and stays the user's to flip.
 */
export function DirectionSection() {
  const { t } = useTranslation();
  const [rtl, setRtl] = useState(() => readUiDirection() === 'rtl');

  useEffect(() => {
    const resync = () => setRtl(readUiDirection() === 'rtl');
    window.addEventListener(UI_DIRECTION_EVENT, resync);
    return () => window.removeEventListener(UI_DIRECTION_EVENT, resync);
  }, []);

  return (
    <ToggleSettingSection
      icon="codicon-arrow-swap"
      label={t('settings.basic.rtl.label')}
      checked={rtl}
      onChange={(checked) => setUiDirection(checked ? 'rtl' : 'ltr')}
      enabledLabel={t('settings.basic.rtl.enabled')}
      disabledLabel={t('settings.basic.rtl.disabled')}
      hint={t('settings.basic.rtl.hint')}
    />
  );
}
