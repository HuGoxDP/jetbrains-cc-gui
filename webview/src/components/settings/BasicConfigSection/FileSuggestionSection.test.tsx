import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { file?: string }) => (opts?.file ? `${key} ${opts.file}` : key),
  }),
}));

import { FileSuggestionSection } from './FileSuggestionSection';

describe('FileSuggestionSection', () => {
  let sent: string[];

  beforeEach(() => {
    sent = [];
    window.sendToJava = vi.fn((message: string) => { sent.push(message); });
  });

  afterEach(() => {
    delete window.updateFileSuggestion;
  });

  it('asks for the setting and shows the command in the user settings', () => {
    render(<FileSuggestionSection />);
    expect(sent[0]).toMatch(/^get_file_suggestion:/);

    act(() => {
      window.updateFileSuggestion?.(JSON.stringify({ command: 'git ls-files' }));
    });

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('git ls-files');
  });

  it('saves what was typed, trimmed; empty removes it', () => {
    render(<FileSuggestionSection />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '  fd --type f  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(JSON.parse(sent[1].replace(/^set_file_suggestion:/, ''))).toEqual({ command: 'fd --type f' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(JSON.parse(sent[2].replace(/^set_file_suggestion:/, ''))).toEqual({ command: '' });
  });

  it('says when the project sets its own command', () => {
    render(<FileSuggestionSection />);
    act(() => {
      window.updateFileSuggestion?.(JSON.stringify({ command: null, overriddenBy: '.claude/settings.local.json' }));
    });
    expect(screen.getByText('settings.basic.fileSuggestion.overridden .claude/settings.local.json')).toBeTruthy();
  });

  it('keeps the text when saving was refused, and shows why', () => {
    render(<FileSuggestionSection />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'my-index' } });

    act(() => {
      window.updateFileSuggestion?.(JSON.stringify({ command: null, error: 'settings.json is not a JSON object; left unchanged' }));
    });

    expect((input as HTMLInputElement).value).toBe('my-index');
    expect(screen.getByRole('alert').textContent).toContain('left unchanged');
  });
});
