# Message Another Running Session (`@@`)

## Goal

Bring Swttch's `@@` mention to CC GUI. With several Claude sessions open (one fixing an
issue, one writing release notes, one reviewing a branch), handing something from one to
another meant copying it by hand. Claude Code can pass a message between sessions on the
same machine with its `SendMessage` tool; `@@` lets the user address one from the chat input.

## Behaviour

### Listing the sessions

Type `@@` in the chat input of a Claude conversation (at the start of a line or after a
space). A list opens with every other Claude session running on this computer, **most
recently active first**. This conversation is left out of its own list.

Each row shows the session's **title** on the left, as History titles it (its first message),
and its **name** on the right. The name is the address the message goes to; a long title is
shortened, the name never is. Sessions of other projects are listed too.

What you type after `@@` narrows the list by title or name. The arrow keys move, Enter or
Tab picks, Escape closes the list and leaves the text alone.

The list is what the official `claude agents --json` prints, so it is the list a terminal
user sees. It is read again whenever it is a few seconds old, since sessions come and go.

When the list cannot be read, it says why: no other session running, no session matching
the text, the Claude Code CLI not found, Claude running inside WSL (not supported), or the
CLI not answering within 10 seconds.

### Sending

Picking a session puts `@@<name>` in the input (for example `@@docs-3 `). Write the message
around it and send it as usual.

The message stays in this conversation as your own message, `@@docs-3` included, so the
chat records whom you addressed. Claude receives it with a note asking it to deliver your
words, without the `@@docs-3`, to that session with `SendMessage` and to do nothing else.
History hides that note, as it hides every system reminder.

- The mention can be anywhere in the message, not only at the start.
- Attachments do not travel with a message to another session: `SendMessage` carries text
  only. They stay in the input for your next message to this conversation.
- Pressing ↑ to recall an earlier message brings `@@<name>` back; sent again, it goes to the
  same session, as long as that name is still in a list this tab has read.
- A message sent while Claude is busy waits in the queue like any other, and keeps its
  address.

### A message from another session

When another session sends a message to this one, the chat shows it as a card labelled
**Message from another session · <name>** with the words it sent, instead of a plain row with
the text Claude Code wraps around it for the model.

## Limits

- **Only Claude conversations.** In Codex and other providers `@@` stays an ordinary file
  reference.
- **Claude does the delivery.** As in a terminal, sending to another session is the model's
  own tool. The other session reads the message at its next turn, after it finishes what it
  is doing.
- **Only names a list showed.** `@@name` addresses a session only when that name appeared in
  a list this tab read (or was picked from it). A name typed by hand that no list showed is
  sent as plain text to this conversation.
- **A name belongs to a process.** When a Claude process restarts, its session gets a new
  name; an old `@@name` then no longer reaches it. Pick it again from the list.
- **Incoming cards appear when the conversation is loaded.** Claude Code writes a message
  from another session to the conversation's transcript but does not send it on the live
  stream, so the card shows when the conversation is opened from History or reloaded.
- **WSL is not supported** for the list, because the CLI then runs inside WSL.

## Where it lives

| Layer | Files |
|-------|-------|
| The list | `handler/ActiveSessionsHandler.java` runs `claude agents --json` (the CLI found as for account login); `provider/claude/ActiveClaudeSessions.java` adds History's titles |
| Delivery note | `session/SessionMentions.java` (appended in `SessionHandler` when `send_message` carries `sessionMention`; hidden from the live message in `SessionContextService`) |
| Composer | `webview/.../ChatInputBox/hooks/useTriggerDetection.ts` (`@@`), `providers/sessionMentionProvider.ts`, `hooks/useChatInputCompletionsCoordinator.ts` |
| Sending | `webview/src/hooks/useMessageSender.ts` (`sessionMention: {name, body}`), `ChatInputBox/hooks/useSubmitHandler.ts` (attachments stay) |
| Incoming card | `webview/src/components/MessageItem/PeerMessageCard.tsx` (the transcript entry's `origin: {kind: "peer", name, body}`) |

## Messages

Inbound (webview → Java): `get_active_sessions`; `send_message` may carry
`sessionMention: {name, body}`.

Outbound (Java → webview): `updateActiveSessions` with `{agents, entries, selfSessionId}`,
where `agents` is the CLI's array unedited and `entries` maps a session id to
`{title, lastTimestamp, messageCount}`, or `{error}` (`wsl`, `cli_not_found`, `timeout`, or a
message).
