# Hide Tool Calls

## Goal

Bring "Hide tool calls" from the Claude Code GUI ("Swttch") plugin to CC GUI: one
switch that keeps the chat to the prompts, the answers and what the turn changed,
the way the Claude Code CLI's focus view (`/focus`) does. File reads, searches,
commands and agents still run; only their cards are not drawn.

## Behaviour

- **Settings → Basic → Behavior → Hide tool calls.** Off by default. Stored in
  `localStorage` (`hideToolCalls`), like the other display switches on that tab.
- **What stays:** tools that change something or ask something. Every provider's
  file-modifying tools (`FILE_MODIFY_TOOL_NAMES`: Edit, Write, MultiEdit,
  NotebookEdit, apply_patch, str_replace, …), `AskUserQuestion`, `EnterPlanMode`,
  `ExitPlanMode`, and `SendUserMessage` (legacy `Brief`), whose call is the reply in
  the CLI's brief mode.
- **What goes:** everything else that is a `tool_use` block, including Task/Agent
  groups, Bash, Read, Grep/Glob, web and MCP tools.
- A reply made only of hidden tools renders nothing, so no empty bubble with copy
  buttons is left between two real messages. A reply with text keeps its text.
- Display only: the session, the agent and the history are untouched, and switching
  it off shows every card again, including those from turns that ran while it was on.
- The switch applies at once in every open chat (a `useSyncExternalStore` over the
  setting, plus the `storage` event for other webviews).

## Where it lives

| Part | File |
|------|------|
| Rule and setting store | `webview/src/utils/hideToolCalls.ts` |
| Filtering | `MessageItem.tsx` — the same `renderedBlocks` filter that already drops tools that render nothing, so a hidden card never regroups or re-renders its neighbours |
| Toggle | `components/settings/BasicConfigSection/BehaviorTab.tsx` |
| Strings | `settings.basic.hideToolCalls.*` in all locales |
| Tests | `utils/hideToolCalls.test.ts`, `MessageItem.test.tsx` ("with tool calls hidden") |
