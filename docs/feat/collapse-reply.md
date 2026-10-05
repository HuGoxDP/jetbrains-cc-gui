# Fold a Reply Away

## Goal

Bring "Collapse a reply and scroll your session by its prompts" from the Claude Code
GUI ("Swttch") plugin to CC GUI. In a long session, finding an earlier prompt meant
scrolling through every reply after it, and a reply already read could not be put
aside. Fold a few replies and the session reads as the list of things you asked.

## Behaviour

- **An arrow on each message you typed.** It sits at the start of the message's
  header row, before the time. `⌄` means the reply below is shown; click it and the
  reply folds away (`›`). It is always visible, dimmed until hovered, unlike the copy
  and quote buttons beside it: whether a reply is folded has to be readable from a
  distance.
- **The reply is everything up to your next message**: Claude's text, tool calls and
  tool results.
- **A line stands in for the folded reply**: "4 steps collapsed", counting the texts
  and tool calls of its assistant messages, or "Reply collapsed" when there are none.
  Clicking the line, or the arrow, unfolds it.
- **Nothing is lost by folding.** Folded replies stay mounted and are only hidden, so
  a thinking block or tool card you opened is still open when the reply comes back.
- **No arrow without a reply.** A message with nothing below it yet (Claude has not
  answered) has no arrow.
- **Works with pinning on or off** (Settings → Basic → Behavior → Pin your last
  message).
- **Per session, in memory.** Folds are cleared when you switch sessions or reload
  the window.

## How it works

`MessageList` splits the visible messages into turns (`groupMessageTurns`) whether
pinning is on or not. Each turn's replies sit in a `.turn-replies` wrapper that is
`display: contents` while shown, so the layout is as before, and `display: none` while
folded. Which turns are folded is a set of head message keys in `MessageList`, reset on
session change.

The arrow is `ReplyFoldToggle`, rendered in the user message header, reading the fold
state from `ReplyFoldContext`. Only the toggles read the context, so folding a reply
does not re-render the memoized messages. The set of foldable keys is derived from a
joined string, so streaming (which changes the turns on every chunk) does not hand the
toggles a new context value each time.

## Where it lives

| Part | File |
|------|------|
| Fold state and rendering | `webview/src/components/MessageList.tsx` |
| Context | `webview/src/contexts/ReplyFoldContext.tsx` |
| Arrow | `webview/src/components/MessageItem/ReplyFoldToggle.tsx` |
| Notice line | `webview/src/components/CollapsedReplyNotice.tsx` |
| Styles | `styles/less/components/message.less` ("Folded replies") |
| Strings | `chat.collapseReply`, `chat.expandReply`, `chat.replyCollapsed`, `chat.replyCollapsedCount_*` in all locales |
| Tests | `MessageList.test.tsx` ("folded replies") |

Checked in the browser (Vite dev server, messages fed through `window.updateMessages`):
two of three replies folded, the notices counted their steps, and unfolding restored
them. Not yet checked inside the IDE's JCEF.
