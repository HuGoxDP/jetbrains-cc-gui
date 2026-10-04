# Fork a Conversation From a Message

## Goal

Bring "Fork conversation from here" from the Claude Code GUI ("Swttch") plugin to
CC GUI. When Claude took a wrong turn a while ago, the user can go back to one of their
own messages and try again from there, keeping everything that came before it and
losing nothing: the original conversation stays as it was.

The terminal has the same idea: pressing Esc twice in `claude` lists your messages and
offers to restore the conversation to one of them. That replaces the conversation in
place; the fork opens a new one beside it instead.

## Behaviour

- **Where:** hover one of your messages in a Claude session. The branch icon next to
  Quote and Copy reads **Fork conversation from here**.
- **What happens:**
  1. A new session is created holding every message *before* the one you picked. The
     picked message and everything after it are not in it.
  2. The new session opens in this tab.
  3. The picked message is put back in the input box, so you can reword it and send it
     down a different path.
- **The original is untouched.** It is only read, never written, and it stays in
  History. The fork appears in History too, titled like any session by its first
  prompt, which it shares with the original. A custom or AI-generated title of the
  original is not copied.
- **A draft is never overwritten.** If the input box already has text, it is kept, the
  message you forked from goes to the clipboard, and a notice says so.
- **When the button is missing:**
  - the session is not Claude's (Codex and the other providers keep their history
    elsewhere);
  - a reply is still streaming (opening another session would interrupt it). The
    button comes back when the reply ends;
  - the message was just sent and Claude has not recorded it yet. Its transcript id
    arrives with the reply.
- **The first message cannot be forked from:** there is nothing before it to keep,
  and the notice suggests a new session instead.
- **Model and settings:** the fork continues with whatever is selected in the input
  bar, like any session opened from History.

### Errors

| Code | When |
|------|------|
| `INVALID_REQUEST` | The request had no valid session id or message id |
| `SESSION_NOT_FOUND` | No `<sessionId>.jsonl` under `~/.claude/projects` |
| `MESSAGE_NOT_FOUND` | The message is not in the saved transcript |
| `NOTHING_BEFORE` | The message opens the conversation |
| `FORK_FAILED` | Reading the source or writing the fork failed (logged) |

If Java does not answer within 30 seconds the webview gives up with the general
failure message, so the button never stays disabled.

## How it works

The fork is a **line-for-line copy of the transcript** up to the picked message,
written as a new session file next to the original. Claude Code then resumes it like
any other session.

- **The cut** (`TranscriptFork`): read lines until the entry whose `uuid` is the
  picked message, keep what came before, then drop the trailing lines after the last
  `user`/`assistant` entry (snapshots and system rows written as the picked turn
  started belong to it). Only `uuid` and `type` are read; every other line, including
  ones that are not JSON, is copied unchanged. Reading stops at the cut.
- **The write** (`SessionForkService`): a new random UUID names the fork. The text goes
  to a sibling temp file `.<id>.jsonl.tmp` created owner-only (`rw-------` where the
  file system has POSIX permissions), then is renamed into `<id>.jsonl` with an atomic
  move, so nothing ever reads a half-written transcript. The temp file is removed on
  any failure.
- **The source file** is found the same way the CLI-session conversion finds it
  (`SessionConversionService.findSessionFile`): the working directory's project folder
  first, then every project folder.

### Why not the CLI's own fork

`claude --resume <id> --resume-session-at <uuid> --fork-session` writes exactly this
file, but only together with a first message: the CLI creates a session and its first
prompt in one step. A fork that opens empty, ready for the user to reword their
message, would need a message the user did not write. Swttch tried injecting one and
dropped it (an API round trip per fork, and the model's reply to it stays in the
conversation); the copy takes milliseconds and leaves the conversation exactly as it
was. The CLI's fork copies entries the same way, uuids and all, so the result has the
shape the CLI expects.

Verified with the real CLI: a two-turn session (code words PINEAPPLE, then MANGO)
forked at the second message and resumed with `claude -p --resume <fork>` answered
"PINEAPPLE" only, and the original transcript was byte-for-byte unchanged.

## Where it lives

| Part | File |
|------|------|
| Cut | `src/main/java/com/github/claudecodegui/handler/history/TranscriptFork.java` |
| Write and reply | `handler/history/SessionForkService.java` |
| Routing (`fork_session`) | `handler/history/HistoryHandler.java` |
| Bridge call | `webview/src/utils/bridge.ts` (`forkSession`) |
| Reply callback | `window.onSessionForked` (`webview/src/global.d.ts`) |
| Flow | `webview/src/hooks/useForkSession.ts` |
| Reaching the messages | `webview/src/contexts/ForkMessageContext.tsx`, provided in `App.tsx` |
| Button | `components/MessageItem/MessageActionButtons.tsx` (`ForkButton`), `MessageItem.tsx` |
| Strings | `fork.*` in all locales |
| Tests | `TranscriptForkTest.java`, `hooks/useForkSession.test.ts`, `MessageItem.test.tsx` ("fork button") |
