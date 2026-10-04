# Claude Multi-Account, Plan Usage and Ultracode

## Goal

Bring the multi-account workflow of the Claude Code GUI ("Swttch") plugin to CC GUI:
save several Claude logins, switch between them without a terminal, see each plan's
5-hour / weekly usage, and move to the next account automatically when a usage limit
stops a turn. Also expose the `ultracode` effort step.

## Where it lives

| Layer | Files |
|-------|-------|
| Storage, switching, rotation | `src/main/java/.../account/*` (`ClaudeAccountManager`, `ClaudeAccountStore`, `ClaudeLiveCredentials`, `ClaudeLoginService`) |
| Webview bridge | `handler/AccountHandler.java` (registered in `ChatWindowDelegate`) |
| Cross-window effects | `ui/toolwindow/ClaudeAccountCoordinator.java` |
| Usage lookups | `ai-bridge/services/claude/usage-service.js` → `ClaudeUsageQueryService` |
| Settings UI | `webview/src/components/settings/AccountsSection/` (sidebar tab "Claude Accounts") |
| Ultracode | `ai-bridge/services/claude/reasoning-effort.js`, `ReasoningSelect` / `reasoningUtils.ts`, `SessionState.ULTRACODE_EFFORT` |

## Messages

Inbound (webview → Java): `get_claude_accounts`, `save_current_claude_account`,
`switch_claude_account`, `delete_claude_account`, `reorder_claude_accounts`,
`set_claude_account_rotation`, `set_claude_auto_rotate`, `refresh_claude_account_usage`,
`start_claude_login`, `submit_claude_login_code`, `cancel_claude_login`.

Outbound (Java → webview): `updateClaudeAccounts`, `onClaudeAccountUsage`,
`onClaudeAccountAction`, `onClaudeLoginEvent`.

Usage readings carry the CLI's own `rate_limits` object unchanged (`five_hour`,
`seven_day`, `seven_day_opus`, `seven_day_sonnet`, `model_scoped[]`), so the UI shows
every window the CLI reports.

## Behaviour

- **Save current login** captures the credentials the Claude CLI uses right now. An
  account with the same email is refreshed in place.
- **Add account** runs `claude auth login` (Claude.ai or Anthropic Console). The OAuth URL
  is shown with Open / Copy buttons, and a code field covers browsers that cannot return
  to the IDE.
- **Switch** writes the saved credentials into the live slot and restarts every Claude
  daemon (immediately when idle, after the turn when streaming) so no runtime keeps the
  previous account's tokens.
- **Usage** is read when the tab opens for accounts whose reading is older than 5 minutes,
  and on demand. On macOS the CLI keeps credentials in the Keychain, so only the active
  account can be read.
- The composer's plan-usage bar now also gets a throttled `get_usage` reading (every
  window, not just the one a `rate_limit_event` names).
- **Automatic rotation**: when a turn stops on a usage limit and rotation is on, the next
  account in the user's order that qualifies is activated and the conversation continues
  with "Continue exactly where you stopped." Accounts can be excluded from the rotation.
- **Ultracode** is the top reasoning step for Claude models that support `xhigh`: `xhigh`
  effort plus the session-scoped `ultracode` setting. Other providers never see it; a stale
  value is sent to them as `xhigh`.
