# Session Activity Markers

## Goal

Bring "see at a glance which session is working" from the Claude Code GUI ("Swttch")
plugin to CC GUI. With several chat tabs open, the only sign of what each was doing was
its title ("…" while answering, "(completed)" for a few seconds), and the history list
said nothing about which sessions were open at all.

## Behaviour

**Chat tabs** wear an icon next to their title:

| Icon | Meaning |
|---|---|
| Spinner | Claude is writing a reply. |
| Yellow dot | The reply stopped on a prompt you have to answer: a tool permission, a question, or a plan to approve. |
| Green dot | The reply has just finished (for the same few seconds the title says "completed"). |
| None | Nothing is happening. |

The title keeps its "…" and "(completed)" as before.

**The history list** marks every session that is open in a tab with a dot before its
title, in the same colours (a turning ring while Claude works, yellow while it waits,
green just after it finished, grey when it is merely open). Hover the dot to read what it
means. Sessions that are not open in any tab have no dot.

**Active** next to the search box keeps only the sessions open in a tab, and says how
many there are: `Active (4)`. Click it again to see every session. It combines with the
search.

- A session open in two tabs shows the state that asks more of you: waiting beats working,
  working beats finished.
- The dots follow the tabs live while the list is open, and the list asks for the current
  state each time it opens.

## How it works

- **Waiting** is reported by the webview: while a reply is in progress and a permission,
  question or plan dialog is open, it sends `tab_status_changed` with `waiting`, and
  `answering` once the dialog is answered and the reply goes on
  (`useReportAwaitingUser`). Working and finished were already reported.
- **The tab icon** is set where the tab title already changes
  (`ChatWindowDelegate.updateTabStatus`), through the public `Content.setIcon` with
  `ToolWindow.SHOW_CONTENT_ICON`; the spinner is the platform's `AnimatedIcon.Default`.
- **The history dots** come from `SessionActivity`, which reads the status of every chat
  window of the project, keyed by the session each shows, and pushes the map to every
  window as `window.onSessionActivity(json)` whenever a tab's status changes. The history
  list asks for it on opening (`get_session_activity`), since a push sent while it was
  closed went nowhere.

## Limits

- **Detached chat windows** (moved out of the tool window) have no tab to draw on, and
  keep no status: their sessions show the grey "open" dot whatever they are doing.
- **"Done" lasts a few seconds**, as the "(completed)" title always has. Swttch keeps a
  finished session marked until you look at it; here the green dot is a short notice.
- **Only this IDE window's tabs** are known. A session running in a terminal, or in
  another IDE window, has no dot.
- Checked in the webview with pushed states (dots, tooltip, filter and its count, the
  request on opening) and by unit tests of the state mapping and the waiting report; the
  tab icons are covered by compiling against the platform API, not seen in an IDE here.
