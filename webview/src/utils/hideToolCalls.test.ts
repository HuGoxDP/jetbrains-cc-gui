import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getHideToolCalls, isAlwaysVisibleTool, isHiddenToolCall, setHideToolCalls, useHideToolCalls } from './hideToolCalls';

describe('hideToolCalls', () => {
  afterEach(() => {
    setHideToolCalls(false);
  });

  it('keeps tools that change or ask, from every provider', () => {
    for (const name of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch', 'str_replace', 'Search Replace',
      'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'SendUserMessage', 'Brief']) {
      expect(isAlwaysVisibleTool(name)).toBe(true);
    }
  });

  it('hides tools that only look or run', () => {
    for (const name of ['Read', 'Grep', 'Glob', 'Bash', 'Task', 'Agent', 'WebFetch', 'ReportFindings', 'mcp__idea__get_file']) {
      expect(isHiddenToolCall({ type: 'tool_use', name })).toBe(true);
    }
  });

  it('never hides text, thinking or images', () => {
    expect(isHiddenToolCall({ type: 'text' })).toBe(false);
    expect(isHiddenToolCall({ type: 'thinking' })).toBe(false);
    expect(isHiddenToolCall({ type: 'image' })).toBe(false);
  });

  it('remembers the choice and tells every reader at once', () => {
    const { result } = renderHook(() => useHideToolCalls());
    expect(result.current).toBe(false);

    act(() => setHideToolCalls(true));
    expect(result.current).toBe(true);
    expect(getHideToolCalls()).toBe(true);

    act(() => setHideToolCalls(false));
    expect(result.current).toBe(false);
    expect(localStorage.getItem('hideToolCalls')).toBeNull();
  });
});
