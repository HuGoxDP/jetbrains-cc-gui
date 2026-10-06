# Emacs Text Keys on macOS

## Goal

Bring "Emacs-style keys in text fields on macOS" from the Claude Code GUI ("Swttch")
plugin to CC GUI. macOS gives every native text field a set of Ctrl+letter keys
(Ctrl+A to the start of the line, Ctrl+E to its end, Ctrl+K to cut the rest of it,
Ctrl+Y to put it back, and so on), and people who use them type them without
thinking. In the chat they did nothing, or did something else.

## Behaviour

On macOS, in every text field of the chat (the message input, the search box, the
settings fields, dialogs):

| Keys | What they do |
|---|---|
| Ctrl+B / Ctrl+F | One character back / forward |
| Ctrl+P / Ctrl+N | One row up / down |
| Ctrl+A / Ctrl+E | Start / end of the paragraph |
| Ctrl+V | One page down |
| Ctrl+D / Ctrl+H | Delete the character after / before the caret |
| Ctrl+K | Cut from the caret to the end of the paragraph; at its end, the line break, so the next line joins on |
| Ctrl+Y | Put back what Ctrl+K cut |
| Ctrl+O | Break the line after the caret, staying in front of the break |
| Ctrl+T | Swap the characters around the caret (at a line's end, the two before it) |
| Ctrl+L | Scroll so the caret is in the middle of the field |

- **Shift extends the selection** with the moves (B, F, P, N, A, E, V), as in macOS.
  The edit keys do nothing with Shift, where macOS binds nothing either.
- **Ctrl+K pressed again appends** to what it cut, so three presses at the start of a
  line take the line, its break and the next line, and one Ctrl+Y gives all of it
  back. The cut text is kept apart from the clipboard (Cmd+C is untouched) and is
  shared by all fields of the window.
- **Edits can be undone** with Cmd+Z: they go through the browser's editing commands.
- **The IDE's own Ctrl+letter actions do not fire** while the chat has focus. In the
  macOS keymap Ctrl+T is "Refactor This" and Ctrl+V the VCS popup; with the chat
  focused these keys now belong to the text, as in any macOS text field. Outside the
  chat they are the IDE's as before.
- **Other platforms are unchanged.** On Windows and Linux Ctrl+letter keeps its usual
  meaning, and nothing here is active.

## How it works

Under off-screen rendering, which out-of-process JCEF forces on macOS, these keys do
nothing on their own: macOS delivers them to a native text view as selectors
(`moveBackward:`, `yank:`, ...), and an off-screen browser has no such view. Worse, the
page receives every Ctrl+letter as Ctrl+A, so it cannot tell them apart.

- **The IDE names the letter.** `EmacsTextKeyShortcutGuard` registers one action on
  the browser component for Ctrl+ and Ctrl+Shift+ the fourteen letters (macOS only).
  The IDE's key dispatcher asks the focused component for its own shortcuts before
  the keymap, so this action runs instead of the keymap's, consumes the key, and
  reads the real letter and Shift state from the AWT event (`EmacsTextKey`). It
  calls `window.onEmacsTextKey(letter, shift)`.
- **The page performs it.** `useEmacsTextKeys` (mounted app-wide) applies the key to
  the focused field (`utils/emacsKeys`). Inputs and textareas are edited by character
  offsets; caret moves in an editable use `Selection.modify`, so a soft-wrapped line
  moves by what is on screen.
- **The chat input breaks lines with elements** (Shift+Enter leaves a `<br>` or a
  `<div>`), where text offsets cannot tell lines apart. There Ctrl+K, Ctrl+Y, Ctrl+O
  and Ctrl+T work on the live selection instead (`selectionEdits.ts`), letting the
  engine find the end of the paragraph. This part is CC GUI's own; Swttch's input
  keeps line breaks as text.
- **A browser keydown under a non-Latin input source** (Korean 2-set, for instance)
  carries the layout's character, and the browser does nothing with it; the letter is
  then read from the physical key code. A keydown with an ASCII letter is left to the
  browser, which handles it itself.

## Limits

- Ctrl+V moves the caret a page down rather than scrolling a page and then moving, as
  macOS does; the text lands in the same place.
- Ctrl+L in a textarea is approximate when lines above the caret wrap.
- Checked in Chromium for the chat input's own structure (lines broken with `<br>`)
  and by unit tests; the IDE side is covered by unit tests of the key mapping and the
  shortcut registration, not on a Mac.
