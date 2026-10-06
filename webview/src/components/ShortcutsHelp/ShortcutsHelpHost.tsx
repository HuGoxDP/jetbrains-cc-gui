import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShortcutsHelpDialog } from './ShortcutsHelpDialog';
import { isMacPlatform, isShortcutsHelpKey } from './keyCombo';

/** Window event that opens the shortcuts window from a button (and leaves it open if it is). */
export const OPEN_SHORTCUTS_HELP_EVENT = 'ccgui:open-shortcuts-help';

export function openShortcutsHelp(): void {
  window.dispatchEvent(new Event(OPEN_SHORTCUTS_HELP_EVENT));
}

interface ShortcutsHelpHostProps {
  sendShortcut: 'enter' | 'cmdEnter';
}

/**
 * Owns the shortcuts window: Cmd/Ctrl+/ opens and closes it from anywhere in the
 * chat, and {@link openShortcutsHelp} opens it from a button.
 */
export function ShortcutsHelpHost({ sendShortcut }: ShortcutsHelpHostProps) {
  const [open, setOpen] = useState(false);
  const mac = useMemo(() => isMacPlatform(), []);
  const context = useMemo(() => ({ mac, sendShortcut }), [mac, sendShortcut]);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    // Capture phase, so a field that handles its own keys cannot swallow it first.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || !isShortcutsHelpKey(e, mac)) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((wasOpen) => !wasOpen);
    };
    const handleOpen = () => setOpen(true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener(OPEN_SHORTCUTS_HELP_EVENT, handleOpen);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener(OPEN_SHORTCUTS_HELP_EVENT, handleOpen);
    };
  }, [mac]);

  return open ? <ShortcutsHelpDialog context={context} onClose={close} /> : null;
}
