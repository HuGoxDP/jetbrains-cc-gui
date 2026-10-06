import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendBridgeEvent } from '../../../utils/bridge';
import { ToggleSettingSection } from './ToggleSettingSection';

/**
 * Claude Code's own `showThinkingSummaries`, the setting a terminal user turns
 * on to see a readable summary of Claude's thinking. It lives in
 * ~/.claude/settings.json, so the toggle reads and writes it there through the
 * IDE, and the bridge turns it into the flag the CLI needs (see
 * ai-bridge/services/claude/thinking-display.js). Ported from Swttch.
 */
export function ThinkingSummariesSection() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const previous = window.updateShowThinkingSummaries;
    window.updateShowThinkingSummaries = (json: string) => {
      try {
        setEnabled(JSON.parse(json).showThinkingSummaries === true);
      } catch (error) {
        console.error('[ThinkingSummariesSection] Failed to parse showThinkingSummaries:', error);
      }
    };
    sendBridgeEvent('get_show_thinking_summaries');
    return () => {
      window.updateShowThinkingSummaries = previous;
    };
  }, []);

  const onChange = (checked: boolean) => {
    setEnabled(checked);
    sendBridgeEvent('set_show_thinking_summaries', JSON.stringify({ showThinkingSummaries: checked }));
  };

  return (
    <ToggleSettingSection
      icon="codicon-lightbulb"
      label={t('settings.basic.thinkingSummaries.label')}
      checked={enabled}
      onChange={onChange}
      enabledLabel={t('settings.basic.thinkingSummaries.enabled')}
      disabledLabel={t('settings.basic.thinkingSummaries.disabled')}
      hint={t('settings.basic.thinkingSummaries.hint')}
    />
  );
}
