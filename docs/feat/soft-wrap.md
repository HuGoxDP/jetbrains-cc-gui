# Wrap Long Lines

## Goal

Bring "Long lines fold so you can read them at a glance" from the Claude Code GUI
("Swttch") plugin to CC GUI. Code blocks and edit diffs kept a long line on one row,
so the end of it, often the part that changed, was only reachable by scrolling
sideways.

## Behaviour

- **Settings → Basic → Appearance → Wrap long lines.** Off by default, as in Swttch:
  wrapping changes where the eye finds indentation. Stored in `localStorage`
  (`softWrap`, only "on" is written) and applied at once in every open chat.
- **What wraps**: code blocks in replies, and the rows of edit diffs. Tool output was
  already wrapped.
- **Paths and JSON wrap too.** Lines break anywhere (`word-break: break-all`), because
  a path or a JSON line has no space to break at and would still overflow.
- **Diff rows keep their colours** across the wrapped lines.

## How it works

The setting does not reach components one by one. `useSoftWrapClass()`, mounted once
in `App`, puts a `soft-wrap` class on `<html>`, and the styles of each block read it
("Soft wrap" in `message.less`). A block added later only needs a rule. The edit diff
rows carry inline styles, so their rules use `!important`; the diff elements have
class names (`edit-diff-scroll`, `edit-diff-rows`, `edit-diff-code`) for that.

## Where it lives

| Part | File |
|------|------|
| Setting store and `<html>` class | `webview/src/utils/softWrap.ts` |
| Toggle | `components/settings/BasicConfigSection/AppearanceTab.tsx` |
| Styles | `styles/less/components/message.less` ("Soft wrap") |
| Diff class names | `components/toolBlocks/EditDiffView.tsx` |
| Strings | `settings.basic.softWrap.*` in all locales |
| Tests | `utils/softWrap.test.ts` |

Checked in the browser: with the setting on, a 150-character line wraps in both a code
block and an edit diff, and the code block no longer scrolls sideways.
