# Thinking Summaries

## Goal

Bring "show thinking summaries" from the Claude Code GUI ("Swttch") plugin to CC GUI.
With recent models the API leaves Claude's thinking out of the reply unless a summary
is asked for, so the thinking block in the chat often shows nothing. Claude Code has
its own setting for this, `showThinkingSummaries`; this change makes it work in CC GUI
and gives it a switch.

## Behaviour

- **Settings → Basic → Behavior → Thinking summaries**: Shown / Hidden. Default Hidden,
  as in Claude Code.
- It is **Claude Code's own setting**, `showThinkingSummaries` in
  `~/.claude/settings.json`. Turning it on writes `"showThinkingSummaries": true`;
  turning it off removes the key, which is what "off" means to Claude Code. A user who
  already set it by hand sees it on here, and the terminal follows the switch too.
- **Applies from the next message.** The flag is fixed when the Claude process starts,
  so changing it starts a new one for the next message, like changing the effort.
- When on, the thinking block fills with a readable summary of Claude's reasoning as it
  streams. It is a summary, written by the API, not the raw thinking.

## Limits

- **Only the user settings file is read**, like CC GUI's other Claude Code settings
  (`alwaysThinkingEnabled`). A `showThinkingSummaries` in a project's
  `.claude/settings.json` is not picked up by CC GUI.
- **A settings.json that cannot be parsed is left alone.** The switch then reports the
  save as failed instead of writing a file that holds only this key.
- Summaries depend on the model: a model without thinking has nothing to summarize.

## How it works

Claude Code reads `showThinkingSummaries` only in its interactive terminal UI, where it
asks the API for `summarized` thinking. The Agent SDK starts Claude Code in a mode that
never reads the setting, so on its own the setting did nothing in CC GUI. The decision
the terminal makes from it amounts to one flag, `--thinking-display summarized`, and the
bridge passes exactly that through the SDK's documented `extraArgs` option
(`ai-bridge/services/claude/thinking-display.js`). Nothing is passed when the setting is
off. The flag sits next to the thinking budget CC GUI already sends
(`maxThinkingTokens`, `effort`) without changing it; the SDK's own `thinking.display`
option was not used because setting `thinking` replaces that budget.

The flag is part of the runtime signature (`runtime-lifecycle.js`), so a runtime started
without it is not reused once it is on.

The IDE side reads and writes the key in `ClaudeSettingsManager`
(`get_show_thinking_summaries` / `set_show_thinking_summaries`). The write parses the
file for this one change, writes it to a temporary file and moves it into place, and
refuses to touch a file it cannot parse.

## Where it lives

| Part | File |
|------|------|
| Flag from the setting | `ai-bridge/services/claude/thinking-display.js` |
| Passed to the SDK | `ai-bridge/services/claude/persistent-query-service.js`, `message-sender.js` (`extraArgs`) |
| Runtime rebuild on change | `ai-bridge/services/claude/runtime-lifecycle.js` (`thinkingDisplay` in the signature) |
| Read / write | `settings/ClaudeSettingsManager.java`, `CodemossSettingsService.java`, `handler/ProjectConfigHandler.java`, `handler/SettingsHandler.java` |
| Switch | `webview/src/components/settings/BasicConfigSection/ThinkingSummariesSection.tsx` |
| Strings | `settings.basic.thinkingSummaries.*` in all locales |
| Tests | `thinking-display.test.js`, `persistent-query-service.test.mjs`, `runtime-lifecycle.test.js`, `ClaudeSettingsManagerThinkingSummariesTest.java`, `ThinkingSummariesSection.test.tsx` |

Checked against Claude Code 2.1.291 through Agent SDK 0.3.291 with the options CC GUI
sends (`maxThinkingTokens: 10000`, partial messages): without the flag the streamed
thinking was empty (0 characters); with it the thinking block received the summary
("2^31-1 equals 2147483647, a Mersenne prime …"). SDK 0.3.182, CC GUI's minimum,
already supports the flag. The switch was checked in the webview dev server (it asks
for the value on open and sends the new value on change); not checked inside an IDE.
