# `/btw` and `/reload-plugins`

## Goal

Bring two terminal commands to CC GUI, as Swttch did. Claude Code marks both as
terminal-only: it leaves them out of the command list a program like this plugin gets, and
refuses them as text. In a terminal they run on the live Claude process without adding a
turn to the conversation, so that is how the plugin runs them too.

| Command | What it does |
|---------|--------------|
| `/btw <question>` | Asks a quick side question about the conversation without adding it to the conversation, even while Claude is answering |
| `/reload-plugins` | Activates plugin changes (installed, updated or edited plugins) in this conversation without restarting it |

## Behaviour

Both appear in the `/` list of a Claude conversation and run straight away, even while
Claude is answering: they are not queued behind the reply.

### `/btw`

- The question and its answer show in a panel above the input, with the note **Not added
  to the conversation**. The chat itself does not change, and Claude's next turn does not
  see the question.
- A new `/btw` replaces the panel's question. The **×** closes it.
- When the conversation has no running Claude process (it was opened from History, or sat
  idle long enough to be closed), the plugin starts one, as sending a message would, and
  then asks.
- The panel says why when there is no answer: the conversation has not started yet, the
  installed Claude Agent SDK cannot answer side questions, Claude could not be started, or
  no answer came in time.

### `/reload-plugins`

- A notice says how many plugins are active afterwards, and how many failed to load.
- Commands and agents a reloaded plugin brings appear the next time you type `/`.
- When no Claude process runs in the tab yet, nothing needs reloading: the notice says the
  plugins load when the conversation starts.

## Limits

- **Claude only.** Other providers answer that the command is for Claude.
- **`/btw` needs a started conversation.** In a new chat there is nothing to ask about yet.
- **`/btw` depends on the SDK.** The plugin uses the SDK's `askSideQuestion`, the request the
  terminal's `/btw` makes. The SDK's type definitions do not list it yet, so the plugin
  checks it is there and says so when it is not.
- **The answer is not kept.** Like the terminal's, it is gone when the panel is closed or
  the tab is reloaded.

## Where it lives

| Layer | Files |
|-------|-------|
| Composer | `webview/src/hooks/useMessageSender.ts` (`SIDE_COMMANDS`), `useAppChatController.ts` (not queued), `ChatInputBox/providers/slashCommandProvider.ts` (in the `/` list) |
| Answer panel | `webview/src/components/SideQuestionPanel/`, `webview/src/utils/sideCommands.ts` |
| IDE | `handler/SideCommandsHandler.java`; `ClaudeSDKBridge#askSideQuestionLive`, `#reloadPluginsLive`, `#preconnectSession` |
| Daemon | `ai-bridge/daemon.js` (`claude.askSideQuestion`, `claude.reloadPlugins`, answered beside the command queue); `services/claude/persistent-query-service.js` (`askSideQuestionPersistent`, `reloadPluginsPersistent`) |

## Messages

Inbound (webview → Java): `ask_side_question` `{requestId, question}`, `reload_plugins`
`{requestId}`.

Outbound (Java → webview): `onSideQuestionResult` `{requestId, ok, answer: {response, ...}}`
and `onReloadPluginsResult` `{requestId, ok, result}` (the SDK's answer as it came), or
`{requestId, ok: false, reason}` (`no-session`, `no-runtime`, `unsupported`,
`unsupported-provider`, `no-answer`, `timeout`, or a message).
