import { describe, expect, it } from 'vitest';
import { getAvailableReasoningLevels, resolveCurrentReasoningLevel } from './reasoningUtils';

const ids = (provider: string, model?: string) =>
  getAvailableReasoningLevels(provider, model).map((level) => level.id);

describe('ultracode reasoning step', () => {
  it('is the top step for Claude models that support xhigh', () => {
    expect(ids('claude', 'claude-opus-5-5')).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']);
    expect(ids('claude', 'claude-fable-5-1')).toContain('ultracode');
  });

  it('is not offered where xhigh is missing or the model is unknown', () => {
    expect(ids('claude', 'claude-sonnet-5-5')).not.toContain('ultracode');
    expect(ids('claude')).not.toContain('ultracode');
  });

  it('is never offered to other providers', () => {
    expect(ids('codex', 'gpt-5.6-sol')).not.toContain('ultracode');
    expect(ids('grok', 'grok-4')).not.toContain('ultracode');
    expect(ids('kimi', 'claude-opus-5-5')).not.toContain('ultracode');
  });

  it('falls back to xhigh when ultracode is no longer available', () => {
    const sonnet = getAvailableReasoningLevels('claude', 'claude-sonnet-5-5');
    const codex = getAvailableReasoningLevels('codex', 'gpt-5.5');
    expect(resolveCurrentReasoningLevel('ultracode', codex)?.id).toBe('xhigh');
    // Sonnet has no xhigh: the closest real level is the top one.
    expect(resolveCurrentReasoningLevel('ultracode', sonnet)?.id).toBe('max');
  });

  it('keeps the existing fallback for real levels', () => {
    const opus = getAvailableReasoningLevels('claude', 'claude-opus-5-5');
    expect(resolveCurrentReasoningLevel('ultracode', opus)?.id).toBe('ultracode');
    // Before ultracode existed, an unknown value fell back to the second-to-last real level.
    expect(resolveCurrentReasoningLevel('bogus' as never, opus)?.id).toBe('xhigh');
  });
});
