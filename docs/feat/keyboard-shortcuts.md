# Keyboard Shortcuts Window

## Goal

Bring the shortcuts list of the Claude Code GUI ("Swttch") plugin to CC GUI: one place
that lists every key the chat answers to, so they can be learned without reading the
code or the changelog.

## Behaviour

- **Ctrl + /** (Cmd + / on macOS) opens the window from anywhere in the chat, and the
  same keys close it. Esc, the × button or a click outside it close it too.
- **Settings → Basic → Behavior → Keyboard shortcuts → Show keyboard shortcuts** opens
  it with the mouse.
- Opening it types nothing into the chat input, and closing it puts the focus back
  where it was, with the draft untouched.
- The list scrolls under a fixed header, so the × button stays in reach.

### What it lists

| Group | Rows |
|-------|------|
| General | Show keyboard shortcuts, Find in the conversation, Zoom in / out / reset, Hide the chat panel (Shift + Esc) |
| Chat input | Send the message, New line, Previous / next prompt (↑ / ↓ in an empty input), Accept the prompt suggested from history (Tab), Quote the selected reply text (Ctrl/Cmd + Shift + Q) |
| Text editing (macOS only) | Cmd + ← / →, Cmd + ↑ / ↓, Cmd + Backspace; with Shift they select |
| Find in conversation | Enter / F3, Shift + Enter / Shift + F3, Alt + C / W / R, Esc |
| Permission prompt | 1 / 2 / 3 for allow once / always allow / deny; ↑ / ↓ and Enter |
| In the code editor | Send the selected code to the chat (Ctrl/Cmd + Alt + K), Ask CC GUI about the selected code (Ctrl/Cmd + Shift + Q) |

- **The send and new-line rows follow the Send Shortcut setting.** With "Enter to
  Send", Send is Enter and New line is Shift + Enter. With "⌘/Ctrl+Enter to Send",
  Send is Cmd + Enter (Ctrl + Enter off macOS) and New line is Enter or Shift + Enter.
- **Keys are named for the platform.** macOS gets the symbols in Apple's order
  (⌃ ⌥ ⇧ ⌘) and ↩ for Enter; Windows and Linux get Ctrl, Alt, Shift and Enter.
- **Rows that do nothing here are left out.** The Cmd text-editing keys appear only on
  macOS; on Windows and Linux Home, End and Ctrl + arrows already do the same.

## Limits

- **The editor rows show the IDE's default keys.** They belong to the IDE keymap; if
  you changed them in Settings → Keymap, the window still shows the defaults (the
  group says so).
- **Ctrl + / in the IDE.** The IDE binds Ctrl + / to Comment with Line Comment, which
  only applies in a code editor, so in the chat the key reaches the chat. A keymap
  that binds it to an action that is enabled everywhere would take it first; the
  Settings button works either way. Not checked inside an IDE.
- **Emacs-style Control keys** (Ctrl + A / E / K / Y in text fields on macOS), the
  other half of this item in Swttch, are not part of this change: inside the IDE the
  JCEF browser delivers Ctrl + letters in a way that needs IDE-level interception. It
  is tracked as its own row in `docs/parity.md`.

## How it works

`ShortcutsHelpHost` (mounted in `App`) listens for the key in the capture phase on
`document`, so a field that handles its own keys cannot swallow it first, and for the
`ccgui:open-shortcuts-help` window event that the Settings button sends. The key is
matched on the character or on the physical `Slash` key, so a layout that puts "/"
elsewhere still reaches it; Shift (which makes it "?"), Alt and a held key are
ignored.

The rows come from `shortcutCatalog.ts`: each entry names its keys in a combo spelling
(`Mod+Shift+Q`, `Shift+Enter`, `Mod++`) where `Mod` is Command on macOS and Ctrl
elsewhere, and `keyCombo.ts` turns that into key caps. A row whose keys resolve to
nothing on this machine is dropped. The dialog takes Esc in the capture phase so it
closes the window instead of reaching the chat input or a prompt underneath.

## Where it lives

| Part | File |
|------|------|
| Rows and groups | `webview/src/components/ShortcutsHelp/shortcutCatalog.ts` |
| Combo reading, key caps, the open key | `webview/src/components/ShortcutsHelp/keyCombo.ts` |
| Window | `webview/src/components/ShortcutsHelp/ShortcutsHelpDialog.tsx`, `styles/less/components/shortcuts-help.less` |
| Open / close | `webview/src/components/ShortcutsHelp/ShortcutsHelpHost.tsx` |
| Settings row | `components/settings/BasicConfigSection/KeyboardShortcutsSection.tsx` |
| Strings | `shortcutsHelp.*`, `settings.basic.keyboardShortcuts.*` in all locales |
| Tests | `ShortcutsHelp/keyCombo.test.ts`, `ShortcutsHelp/shortcutCatalog.test.ts` (also checks every locale has every row), `ShortcutsHelp/ShortcutsHelpHost.test.tsx` |

Checked in the browser (webview dev server): with "draft" in the chat input, Ctrl + /
opens the window with 19 rows and the input still reads "draft"; Esc closes it and the
input has the focus again; the Settings button opens it over Settings. With a macOS
user agent Cmd + / opens it with 22 rows (the three Cmd editing rows added), in
symbols, and Ctrl + / does nothing there.
