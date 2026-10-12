import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendToJava } from '../../../utils/bridge';
import { ClaudeConfigDirSection } from './ClaudeConfigDirSection';

vi.mock('../../../utils/bridge', () => ({
  sendToJava: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options?.project ? `${key}:${options.project}` : key,
  }),
}));

function reply(info: Record<string, unknown>) {
  act(() => {
    window.updateClaudeConfigDir?.(JSON.stringify(info));
  });
}

describe('ClaudeConfigDirSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the IDE for the values when it opens', () => {
    render(<ClaudeConfigDirSection />);
    expect(sendToJava).toHaveBeenCalledWith('get_claude_config_dir', {});
  });

  it('shows both values and the folder in use, with why', () => {
    render(<ClaudeConfigDirSection />);
    reply({
      hasProject: true,
      globalValue: '~/claude-all',
      projectValue: '/claude/app',
      effective: '/claude/app',
      source: 'project',
    });
    expect((screen.getByLabelText('settings.basic.claudeConfigDir.allProjects') as HTMLInputElement).value).toBe('~/claude-all');
    expect((screen.getByLabelText('settings.basic.claudeConfigDir.thisProject') as HTMLInputElement).value).toBe('/claude/app');
    expect(screen.getByText('/claude/app', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText(/settings\.basic\.claudeConfigDir\.source\.project/)).toBeTruthy();
  });

  it('names the outer project a value comes from', () => {
    render(<ClaudeConfigDirSection />);
    reply({ hasProject: true, effective: '/claude/work', source: 'project', fromProject: '/work' });
    expect(screen.getByText(/settings\.basic\.claudeConfigDir\.source\.parentProject:\/work/)).toBeTruthy();
  });

  it('saves the value of the row whose Save is pressed, trimmed', () => {
    render(<ClaudeConfigDirSection />);
    reply({ hasProject: true, globalValue: '', projectValue: '', effective: '/home/me/.claude', source: 'default' });
    fireEvent.change(screen.getByLabelText('settings.basic.claudeConfigDir.thisProject'), { target: { value: ' /claude/app ' } });
    fireEvent.click(screen.getAllByText('common.save')[1]);
    expect(sendToJava).toHaveBeenCalledWith('set_claude_config_dir', { scope: 'project', value: '/claude/app' });
  });

  it('saves with Enter, and clearing a field saves an empty value', () => {
    render(<ClaudeConfigDirSection />);
    reply({ hasProject: true, globalValue: '/claude/all', projectValue: '', effective: '/claude/all', source: 'global' });
    const all = screen.getByLabelText('settings.basic.claudeConfigDir.allProjects');
    fireEvent.change(all, { target: { value: '' } });
    fireEvent.keyDown(all, { key: 'Enter' });
    expect(sendToJava).toHaveBeenCalledWith('set_claude_config_dir', { scope: 'global', value: '' });
  });

  it('shows a refusal from the IDE and keeps what was typed', () => {
    render(<ClaudeConfigDirSection />);
    reply({ hasProject: true, globalValue: '', projectValue: '', effective: '/home/me/.claude', source: 'default' });
    fireEvent.change(screen.getByLabelText('settings.basic.claudeConfigDir.allProjects'), { target: { value: 'claude' } });
    reply({ hasProject: true, globalValue: '', projectValue: '', effective: '/home/me/.claude', source: 'default', error: 'The folder must be an absolute path (or start with ~)' });
    expect(screen.getByRole('alert').textContent).toContain('absolute path');
    expect((screen.getByLabelText('settings.basic.claudeConfigDir.allProjects') as HTMLInputElement).value).toBe('claude');
  });

  it('has no project row to fill without a project folder', () => {
    render(<ClaudeConfigDirSection />);
    reply({ hasProject: false, globalValue: '', projectValue: '', effective: '/home/me/.claude', source: 'default' });
    expect((screen.getByLabelText('settings.basic.claudeConfigDir.thisProject') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('settings.basic.claudeConfigDir.noProject')).toBeTruthy();
  });
});
