# Stop or Message a Background Agent

## Goal

Bring "stop a background task" and "talk to a background agent" from the Claude Code
GUI ("Swttch") plugin's background tasks panel to CC GUI. An agent Claude started in
the background (an Agent call with `run_in_background`) could be watched in the status
panel, but not stopped short of interrupting the whole reply, and not written to.

## Behaviour

In the status panel's **Subagent** tab, a background agent that is still running gets
two buttons at the end of its row:

| Button | What it does |
|---|---|
| Speech bubble (**Message this agent**) | Puts `Use SendMessage to tell the background agent "<name>" (<agent id>):` into the chat input, for you to finish and send. Claude passes the message on. |
| Square (**Stop this agent**) | Stops that agent alone. The reply in progress and the other agents go on. |

- **Only running background agents** have them. A finished agent, an agent Claude waits
  for in the foreground, and agents of other providers have neither.
- **Message** appears once the agent's id is known, which is when its launch result
  arrives (a moment after it starts). Nothing is sent until you send the message
  yourself.
- **Stop** waits (a spinner) while the request is out. When the agent stops, its row
  turns to its stopped state as the CLI reports it. When it cannot be stopped, a notice
  says why and the button is offered again:
  - the installed Claude Agent SDK has no way to stop a single task (update it, or stop
    the whole reply);
  - the agent's conversation is no longer running;
  - the agent has already finished.

## How it works

- **Stopping** uses the Claude Agent SDK's `Query.stopTask(taskId)`, the same request the
  CLI uses for a single task. The webview sends `stop_background_task` with the agent's
  tool call id and agent id; `BackgroundTaskHandler` asks the daemon (`claude.stopTask`),
  which, like the live permission-mode switch, bypasses the command queue: the agent
  usually runs while a turn is in progress, and waiting for that turn to end would defeat
  the purpose. The daemon finds the task id the CLI announced in `task_started` for that
  tool call (`runtime.taskIdByToolUseId`), falling back to the agent id for a task it never
  saw start. The answer comes back through `window.onBackgroundTaskStopResult`, matched to
  the request by tool call id, so it lands even if the panel was closed meanwhile.
- **Messaging** goes through Claude, as in the CLI, where you ask Claude and Claude calls
  its `SendMessage` tool with the agent's id. The button only writes that request for
  you, with the id Claude needs (the agent's runtime id, not its description).

## Limits

- **Stop needs a Claude Agent SDK with `Query.stopTask`.** Older SDKs answer
  "cannot stop a single task"; Esc still stops the whole reply.
- **Messaging costs a turn of the main conversation**, because Claude relays it. Swttch
  hides that relay from the transcript; here the request is an ordinary message you can
  read and edit before sending.
- Background Bash commands are not listed in the Subagent tab, so they have no buttons
  here.
- Checked in the webview with a running background agent (buttons, the request sent,
  the prefilled message, the refusal notice) and by unit tests of the daemon's task-id
  lookup and the Java request parsing; not against a live agent in the IDE.
