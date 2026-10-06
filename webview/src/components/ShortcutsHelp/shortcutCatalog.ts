import { keyCapsFor } from './keyCombo';

/** The sections of the list, in the order they appear. */
export const ShortcutGroup = {
  General: 'general',
  ChatInput: 'chatInput',
  TextEditing: 'textEditing',
  Search: 'search',
  Permission: 'permission',
  Editor: 'editor',
} as const;
export type ShortcutGroup = (typeof ShortcutGroup)[keyof typeof ShortcutGroup];

/** Stable names for the rows, so a test or a translation can point at one. */
export const ShortcutId = {
  OpenHelp: 'openHelp',
  SearchConversation: 'searchConversation',
  ZoomIn: 'zoomIn',
  ZoomOut: 'zoomOut',
  ZoomReset: 'zoomReset',
  HidePanel: 'hidePanel',
  SendMessage: 'sendMessage',
  InsertNewline: 'insertNewline',
  RecallPrompt: 'recallPrompt',
  AcceptSuggestion: 'acceptSuggestion',
  QuoteSelection: 'quoteSelection',
  LineEdges: 'lineEdges',
  TextEdges: 'textEdges',
  DeleteToLineStart: 'deleteToLineStart',
  SearchNext: 'searchNext',
  SearchPrevious: 'searchPrevious',
  SearchOptions: 'searchOptions',
  SearchClose: 'searchClose',
  PermissionChoose: 'permissionChoose',
  PermissionMove: 'permissionMove',
  SendSelection: 'sendSelection',
  QuickFix: 'quickFix',
} as const;
export type ShortcutId = (typeof ShortcutId)[keyof typeof ShortcutId];

/** What a row may depend on when it decides which keys to name. */
export interface ShortcutContext {
  /** True on macOS, where Cmd is the primary modifier and symbols are used. */
  mac: boolean;
  /** The send key chosen in Settings → Basic → Behavior. */
  sendShortcut: 'enter' | 'cmdEnter';
}

/** The combinations that do the job here, or none when the row has nothing true to say. */
export type ShortcutKeys = (context: ShortcutContext) => readonly string[];

export interface ShortcutEntry {
  id: ShortcutId;
  group: ShortcutGroup;
  keys: ShortcutKeys;
  /** Shown on macOS only: elsewhere the keys do nothing, or Home/End already do it. */
  macOnly?: boolean;
}

const fixed =
  (...combos: string[]): ShortcutKeys =>
  () =>
    combos;

const sendKeys: ShortcutKeys = ({ sendShortcut }) => (sendShortcut === 'cmdEnter' ? ['Mod+Enter'] : ['Enter']);

/** In Cmd/Ctrl+Enter mode a bare Enter breaks the line too. */
const newlineKeys: ShortcutKeys = ({ sendShortcut }) =>
  sendShortcut === 'cmdEnter' ? ['Enter', 'Shift+Enter'] : ['Shift+Enter'];

/** Every shortcut the window can list, in the order they appear in a group. */
export const SHORTCUT_CATALOG: readonly ShortcutEntry[] = [
  { id: ShortcutId.OpenHelp, group: ShortcutGroup.General, keys: fixed('Mod+/') },
  { id: ShortcutId.SearchConversation, group: ShortcutGroup.General, keys: fixed('Mod+F') },
  { id: ShortcutId.ZoomIn, group: ShortcutGroup.General, keys: fixed('Mod++') },
  { id: ShortcutId.ZoomOut, group: ShortcutGroup.General, keys: fixed('Mod+-') },
  { id: ShortcutId.ZoomReset, group: ShortcutGroup.General, keys: fixed('Mod+0') },
  { id: ShortcutId.HidePanel, group: ShortcutGroup.General, keys: fixed('Shift+Escape') },

  { id: ShortcutId.SendMessage, group: ShortcutGroup.ChatInput, keys: sendKeys },
  { id: ShortcutId.InsertNewline, group: ShortcutGroup.ChatInput, keys: newlineKeys },
  { id: ShortcutId.RecallPrompt, group: ShortcutGroup.ChatInput, keys: fixed('ArrowUp', 'ArrowDown') },
  { id: ShortcutId.AcceptSuggestion, group: ShortcutGroup.ChatInput, keys: fixed('Tab') },
  { id: ShortcutId.QuoteSelection, group: ShortcutGroup.ChatInput, keys: fixed('Mod+Shift+Q') },

  { id: ShortcutId.LineEdges, group: ShortcutGroup.TextEditing, keys: fixed('Mod+ArrowLeft', 'Mod+ArrowRight'), macOnly: true },
  { id: ShortcutId.TextEdges, group: ShortcutGroup.TextEditing, keys: fixed('Mod+ArrowUp', 'Mod+ArrowDown'), macOnly: true },
  { id: ShortcutId.DeleteToLineStart, group: ShortcutGroup.TextEditing, keys: fixed('Mod+Backspace'), macOnly: true },

  { id: ShortcutId.SearchNext, group: ShortcutGroup.Search, keys: fixed('Enter', 'F3') },
  { id: ShortcutId.SearchPrevious, group: ShortcutGroup.Search, keys: fixed('Shift+Enter', 'Shift+F3') },
  { id: ShortcutId.SearchOptions, group: ShortcutGroup.Search, keys: fixed('Alt+C', 'Alt+W', 'Alt+R') },
  { id: ShortcutId.SearchClose, group: ShortcutGroup.Search, keys: fixed('Escape') },

  { id: ShortcutId.PermissionChoose, group: ShortcutGroup.Permission, keys: fixed('1', '2', '3') },
  { id: ShortcutId.PermissionMove, group: ShortcutGroup.Permission, keys: fixed('ArrowUp', 'ArrowDown', 'Enter') },

  // The IDE's keymap owns these two, so they are the defaults it ships with.
  { id: ShortcutId.SendSelection, group: ShortcutGroup.Editor, keys: fixed('Mod+Alt+K') },
  { id: ShortcutId.QuickFix, group: ShortcutGroup.Editor, keys: fixed('Mod+Shift+Q') },
];

/** A group as drawn: its title, and the note under the title if any. */
export interface ShortcutGroupMeta {
  group: ShortcutGroup;
  titleKey: string;
  noteKey?: string;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroupMeta[] = [
  { group: ShortcutGroup.General, titleKey: 'shortcutsHelp.groups.general' },
  { group: ShortcutGroup.ChatInput, titleKey: 'shortcutsHelp.groups.chatInput' },
  { group: ShortcutGroup.TextEditing, titleKey: 'shortcutsHelp.groups.textEditing', noteKey: 'shortcutsHelp.notes.textEditing' },
  { group: ShortcutGroup.Search, titleKey: 'shortcutsHelp.groups.search' },
  { group: ShortcutGroup.Permission, titleKey: 'shortcutsHelp.groups.permission' },
  { group: ShortcutGroup.Editor, titleKey: 'shortcutsHelp.groups.editor', noteKey: 'shortcutsHelp.notes.editor' },
];

/** A row ready to draw: one list of key caps per combination. */
export interface VisibleShortcut {
  id: ShortcutId;
  group: ShortcutGroup;
  descriptionKey: string;
  combos: string[][];
}

/**
 * The rows that are true on this machine: a row for another platform is left
 * out, and so is one that resolves to no keys, since it would name a key that
 * does nothing.
 */
export function visibleShortcuts(context: ShortcutContext): VisibleShortcut[] {
  const rows: VisibleShortcut[] = [];
  for (const entry of SHORTCUT_CATALOG) {
    if (entry.macOnly && !context.mac) continue;
    const combos = entry
      .keys(context)
      .map((combo) => keyCapsFor(combo, context.mac))
      .filter((caps) => caps.length > 0);
    if (combos.length === 0) continue;
    rows.push({ id: entry.id, group: entry.group, descriptionKey: `shortcutsHelp.rows.${entry.id}`, combos });
  }
  return rows;
}
