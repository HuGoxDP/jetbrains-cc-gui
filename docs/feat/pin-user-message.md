# Pin Your Last Message

## Goal

Bring "No more scrolling back to see what you asked for" from the Claude Code GUI
("Swttch") plugin to CC GUI. Give Claude one task and a long run of tool calls and
thinking follows; the message that started it scrolls off the screen, and checking
whether the work still matches what you asked meant scrolling up to find it and back
down again.

Now the message stays at the top of the chat while its reply scrolls past.

## Behaviour

- **Pinned while its reply is on screen.** Scroll down through a reply and the user
  message that started it stays at the top of the chat.
- **Handed off, not stacked.** When the next user message scrolls up, it pushes the
  previous one out and takes its place. Scrolling up and down the conversation, it is
  always clear which message the part you are reading answers.
- **Replies fade as they pass under it** instead of being cut along a hard line.
- **Back to where it sits.** Hover a pinned message for a small button at its left; it
  scrolls smoothly to where the message really is in the conversation. The button only
  appears while the message is actually pinned (on a message at rest it would lead
  where you already are). On touch screens it is always shown on the pinned message.
- **A long message does not take over the screen.** User messages are already folded
  to a few lines; one you expanded is held at most 30% of the chat's height while
  pinned, and scrolls inside its bubble.
- **Only messages you typed are pinned.** Tool results reach the chat as "user"
  messages too (about ten for every real one); they never start a turn, so nothing
  blank is ever pinned. The same rule already decides where "Show earlier turns"
  splits the conversation.
- **The message rail follows it.** Clicking a dot scrolls to where the message really
  is, not to where it is held, and the highlighted dot is the turn filling the top of
  the chat.
- **Settings → Basic → Behavior → Pin your last message.** On by default, stored in
  `localStorage` (`pinUserMessages`; only "off" is written), and applied at once in
  every open chat. Off gives the flat list exactly as before.

## How it works

`MessageList` splits the visible messages into turns (`groupMessageTurns`): each
message the user typed starts one, and everything up to the next belongs to it. Each
turn is rendered by `MessageTurn` as its own box, and the user message sits in a
`position: sticky` slot at the top of that box. A sticky element never leaves the box
it sits in, so when a turn ends its message is pushed out by the next one; that is the
whole reason for the boxes. Messages before the first one the user typed render
outside any turn.

Turn boxes are keyed by the key of the message that opens them, so a new turn arriving,
or "Show earlier turns" revealing old ones, never remounts a message: expanded
thinking and other per-message state survive.

Whether a message is pinned right now comes from a zero-height marker just above it,
watched by an `IntersectionObserver` rooted at the chat's scroller: once the marker has
gone out over the top, the message is the one being held. The state is written to the
slot's `data-pinned` attribute directly, so pinning never re-renders a message, and
nothing is computed while scrolling.

The pinned slot paints the chat background over its row and fades it out over the
row's bottom padding. Its `z-index` (25) is above everything drawn inside messages
(copy buttons, code copy, inline tooltips) and below floating tooltips and the search
panel.

The message rail measures and watches the turn box (`placeOf`) instead of the message,
because a pinned message's own box reports where it is held.

## Where it lives

| Part | File |
|------|------|
| Turn split | `webview/src/components/messageTurns.ts` |
| Turn box, marker, jump button | `webview/src/components/MessageTurn.tsx` |
| Rendering by turn | `webview/src/components/MessageList.tsx` |
| Rail measuring the turn | `webview/src/components/MessageAnchorRail.tsx` |
| Setting store | `webview/src/utils/pinUserMessages.ts` |
| Toggle | `components/settings/BasicConfigSection/BehaviorTab.tsx` |
| Styles | `styles/less/components/message.less` ("Pinned user message") |
| Strings | `chat.jumpToPinnedMessage`, `settings.basic.pinUserMessages.*` in all locales |
| Tests | `messageTurns.test.ts`, `MessageTurn.test.tsx`, `MessageList.test.tsx` ("pinned user messages"), `utils/pinUserMessages.test.ts` |

Checked in the browser (Vite dev server, messages fed through `window.updateMessages`):
the first message pins while its reply scrolls, the second pushes it out, the rail's
highlighted dot follows, and the jump button scrolls back to the message and unpins it.
Not yet checked inside the IDE's JCEF.
