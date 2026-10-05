# Interface Zoom and Line Spacing

## Goal

Bring two appearance settings from the Claude Code GUI ("Swttch") plugin to CC GUI:

- **Interface zoom** with the keys browsers and editors use: Ctrl + "+", "-" and "0"
  (Cmd on macOS).
- **Line spacing** of the text in chat messages.

## Behaviour

### Interface zoom

| Keys (Windows / Linux) | macOS | Does |
|------------------------|-------|------|
| Ctrl + "+" (or "=", or numpad +) | Cmd + "+" | Zoom in one step |
| Ctrl + "-" (or numpad -) | Cmd + "-" | Zoom out one step |
| Ctrl + "0" (or numpad 0) | Cmd + "0" | Back to 100% |

- **Steps** follow the browser's ladder: 50, 67, 75, 80, 90, 100, 110, 125, 150, 175,
  200, 250, 300%. Zooming out and back in lands exactly on 100%.
- **Indicator.** While adjusting, a panel in the top-right corner shows the
  percentage with −, + and Reset buttons. Repeated presses update the same panel; it
  hides 3 seconds after the last one, not while the pointer is on it, and at once on
  Esc.
- **Settings → Basic → Appearance → Interface zoom** shows the same value with −, +
  and Reset, so it can be changed without knowing the keys.
- **It multiplies with Font size.** Font size already zoomed the whole `#app` (80 to
  140%). The interface zoom is a second factor of the same `--font-scale`: Font size
  110% and zoom 125% give 137.5%.
- Stored in `localStorage` (`uiZoom`); 100% is not stored.

### Line spacing

- **Settings → Basic → Appearance → Line spacing**: a number from 0.5 to 10 in steps
  of 0.1, default 1.6 (the value the message text always had). Typed values are
  rounded to 0.1 and kept in range; an empty field puts the value back. Reset returns
  to 1.6.
- Applies to the text of messages: paragraphs, lists, headings, quotes, tables.
  **Code blocks keep the editor's line spacing**, and the thinking block keeps its own.
- Stored in `localStorage` (`chatLineHeight`); 1.6 is not stored.

## Limits

- **The keys only work while the chat has focus.** Inside the IDE, a key the IDE
  keymap binds to an action may reach the IDE first. The settings row works either
  way.
- **No zoom by mouse wheel.** Swttch removed Ctrl + wheel because a listener that can
  cancel wheel events made all scrolling wait on the main thread; it is not added
  here either. Pinch-to-zoom on a trackpad is the browser's own and is untouched.
- **Right-to-left layout** (the third part of this item in Swttch) is not part of this
  change; it is tracked separately in `docs/parity.md`.

## How it works

`--font-scale` on `<html>` is what `#app` is zoomed by (`base.less`). Every writer of
it now goes through `chatScale(level, uiZoom)` in `utils/fontScale.ts`: startup
(`useThemeInit`), the Font size setting (`useSettingsThemeSync`), the scale recovery in
`main.tsx`, and the zoom itself (`UiZoomControls`). The product is rounded so
1.1 × 1.25 does not leave float noise in the CSS. After a change the zoom calls
`forceWebviewRepaint`, as the Font size setting does, because a CSS variable change
alone leaves the Linux OSR surface stale.

The zoom keys are read by physical code on the numpad (`Numpad0`, `NumpadAdd`,
`NumpadSubtract`): with NumLock off the numpad's `key` turns into `Insert` and the
like, and Ctrl+Insert is a copy. On Windows and Linux `metaKey` is the Super key and
is not read.

Line spacing reaches the styles as `--chat-line-height` on `<html>`, set by
`useChatLineHeightVar()` in `App` and read by `.message-content` and
`.markdown-content` in `message.less`.

## Where it lives

| Part | File |
|------|------|
| Zoom store, ladder, keys | `webview/src/utils/uiZoom.ts` |
| Combined scale | `webview/src/utils/fontScale.ts` (`chatScale`, `storedChatScale`) |
| Keys and indicator | `webview/src/components/UiZoomControls.tsx`, `styles/less/components/ui-zoom.less` |
| Line spacing store and CSS variable | `webview/src/utils/chatLineHeight.ts` |
| Settings rows | `components/settings/BasicConfigSection/UiZoomSection.tsx`, `LineSpacingSection.tsx` |
| Strings | `uiZoom.*`, `settings.basic.uiZoom.*`, `settings.basic.lineSpacing.*` in all locales |
| Tests | `utils/uiZoom.test.ts`, `utils/chatLineHeight.test.ts`, `components/UiZoomControls.test.tsx`, `components/settings/hooks/useSettingsThemeSync.zoom.test.ts` |

Checked in the browser (webview dev server): two Ctrl + "=" presses set `--font-scale`
and the zoom of `#app` to 1.25 and show "125%"; Ctrl + "0" returns to 1 and clears the
stored value; with Font size 110% and zoom 110% the scale is 1.21, and + in Settings
makes it 1.375. Line spacing 2.2 makes a 14px paragraph's line height 30.8px instead of
22.4px; typing 2.44 stores 2.4. Not checked inside an IDE.
