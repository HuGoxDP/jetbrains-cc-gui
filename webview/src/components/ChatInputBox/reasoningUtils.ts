import { useEffect, useMemo } from 'react';
import {
  EFFORT_SUPPORTED_CLAUDE_MODELS,
  MAX_EFFORT_CLAUDE_MODELS,
  REASONING_LEVELS,
  XHIGH_EFFORT_CLAUDE_MODELS,
  codexModelSupportsMaxEffort,
  type ReasoningEffort,
  type ReasoningInfo,
} from './types';

export function isReasoningVisible(currentProvider?: string, selectedModel?: string): boolean {
  return currentProvider !== 'claude' || !selectedModel || EFFORT_SUPPORTED_CLAUDE_MODELS.has(selectedModel);
}

export function getAvailableReasoningLevels(
  currentProvider?: string,
  selectedModel?: string,
): ReasoningInfo[] {
  return REASONING_LEVELS.filter((level) => {
    if (level.id === 'ultracode') {
      // Claude only, and only on models that have the xhigh level it runs at.
      return currentProvider === 'claude'
        && selectedModel !== undefined
        && XHIGH_EFFORT_CLAUDE_MODELS.has(selectedModel);
    }
    if (currentProvider === 'grok') {
      return level.id === 'low' || level.id === 'medium' || level.id === 'high' || level.id === 'xhigh';
    }
    if (currentProvider === 'codex') {
      return level.id !== 'max' || (selectedModel !== undefined && codexModelSupportsMaxEffort(selectedModel));
    }
    if (currentProvider !== 'claude') {
      return level.id !== 'max';
    }
    if (!selectedModel) {
      return true;
    }
    if (level.id === 'xhigh') {
      return XHIGH_EFFORT_CLAUDE_MODELS.has(selectedModel);
    }
    if (level.id === 'max') {
      return MAX_EFFORT_CLAUDE_MODELS.has(selectedModel);
    }
    return true;
  });
}

export function resolveCurrentReasoningLevel(
  value: ReasoningEffort,
  availableLevels: ReasoningInfo[],
): ReasoningInfo | undefined {
  const exact = availableLevels.find((level) => level.id === value);
  if (exact) {
    return exact;
  }
  // Fall back among the real levels: ultracode is an opt-in step, never a default.
  const realLevels = availableLevels.filter((level) => level.id !== 'ultracode');
  if (value === 'ultracode') {
    // Ultracode runs at xhigh; keep the closest real level when it goes away.
    return realLevels.find((level) => level.id === 'xhigh')
      || realLevels[realLevels.length - 1]
      || availableLevels[0];
  }
  return realLevels[realLevels.length - 2]
    || realLevels[0]
    || availableLevels[0];
}

export function useReasoningEffortGuard(
  value: ReasoningEffort,
  onChange: (effort: ReasoningEffort) => void,
  selectedModel?: string,
  currentProvider?: string,
): {
  isVisible: boolean;
  availableLevels: ReasoningInfo[];
  currentLevel: ReasoningInfo | undefined;
} {
  const isVisible = isReasoningVisible(currentProvider, selectedModel);
  const availableLevels = useMemo(
    () => getAvailableReasoningLevels(currentProvider, selectedModel),
    [currentProvider, selectedModel],
  );
  const currentLevel = resolveCurrentReasoningLevel(value, availableLevels);

  useEffect(() => {
    if (!isVisible || availableLevels.some((level) => level.id === value)) {
      return;
    }
    if (currentLevel) {
      onChange(currentLevel.id);
    }
  }, [availableLevels, currentLevel, isVisible, onChange, value]);

  return { isVisible, availableLevels, currentLevel };
}
