# Continue the Conversation When the Usage Limit Resets

## Goal

Bring "auto-resume on usage-limit reset" from the Claude Code GUI ("Swttch") plugin to
CC GUI. A Claude plan has a 5-hour and a weekly usage limit. When a turn stops on one,
Claude Code tells the client when that limit resets, in the `resetsAt` field of its
`rate_limit_event`. In a terminal the user waits and types "continue" once that time has
passed. CC GUI could already move the conversation to another saved account
([automatic rotation](./claude-multi-account.md)), but with one account, or with every
account in the rotation at its limit, the conversation stayed stopped until the user came
back.

## Behaviour

**Settings → Claude Accounts** has a second switch under the rotation switch:

- **Switch accounts automatically on a usage limit** (existing): move the conversation to
  the next account in the rotation.
- **Continue when the limit resets** (new, off by default): when a usage limit stops a turn
  and no other account takes over, send "Continue exactly where you stopped." once the
  limit resets.

Rotation is tried first. Only when it is off, or no account in the rotation qualifies,
does the conversation wait for the reset.

While a conversation waits, a notice sits above the input: "Usage limit reached.
Continuing at 2:31 PM." The time is the reset time from Claude Code plus one minute, so a
computer clock a little behind the server's is not refused again. For a weekly limit the
notice also gives the day ("Continuing at Tue, Oct 14, 9:01 AM"). **Cancel** takes the
notice down and nothing is sent.

At that time the continuation goes to the same conversation, exactly as if the user had
typed it. If the limit is still in force, Claude Code reports a new reset time and the
conversation waits again.

The wait ends without sending anything when the conversation moves on first:

- the user sends a message of their own (with or without attachments);
- the conversation is restarted, or the tab switches to another conversation or a new one;
- the chat tab or the IDE is closed.

A continuation is never sent into a conversation that is busy: if a turn is running when
the time comes, nothing is sent.

## Limits

- **The wait lives in the IDE.** It is not saved anywhere: closing the IDE drops it, and
  it does not come back on the next start.
- **It needs the reset time from Claude Code.** If the `rate_limit_event` carries no
  `resetsAt`, nothing is scheduled and a toast says so ("Claude Code did not say when the
  usage limit resets, so the conversation will not continue by itself.").
- **The IDE must be running** at the reset time. If the computer sleeps through part of
  the wait, the continuation can go out later than the notice says.
- **Only Claude conversations.** Codex conversations are not covered.
- **A turn the user stopped is not continued.** A usage limit that arrives after the user
  pressed Stop does not start a wait.

## Where it lives

| Layer | Files |
|-------|-------|
| The wait | `src/main/java/.../account/LimitResume.java` (one per session object, cancelled on send, restart, session change and dispose) |
| Reset time | `session/ClaudeMessageHandler.handleRateLimit` → `SessionState.markUsageLimitReached(resetsAtMs)` |
| Decision after a stopped turn | `ClaudeChatWindow.onStreamEnded` → `ClaudeAccountCoordinator.onUsageLimitReached` (rotation), else `continueWhenLimitResets` |
| Setting | `ClaudeAccountStore.Registry.autoContinue`, `ClaudeAccountManager.setAutoContinue` |
| Notice | `webview/src/components/LimitResumeNotice/` (mounted in `ChatScreen` above the input) |
| Settings UI | `webview/src/components/settings/AccountsSection/` |

## Messages

Inbound (webview → Java): `set_claude_auto_continue` (`{"enabled": boolean}`),
`get_limit_resume` (the notice asks once when it mounts), `cancel_limit_resume`.

Outbound (Java → webview): `updateLimitResume` with `{"at": <epoch ms>}` while a
continuation waits and `{"at": null}` once it is sent or cancelled; `updateClaudeAccounts`
now carries `autoContinue`.
