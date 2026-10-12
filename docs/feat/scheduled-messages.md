# Scheduled Messages (Send Later)

## Goal

Bring Swttch's scheduled messages to CC GUI: a Slack-style "send later" for the chat. Write
a message now, pick when it should go out, and at that moment the chat sends it exactly as
if it had been typed and sent by hand. Reservations belong to one conversation and can be
listed, changed and cancelled until they go out.

## Behaviour

Once a conversation has started (it has a session, so after its first message), the header
has a **watch** button between Search and History. It opens **Scheduled messages** for that
conversation. A badge on the button counts the messages waiting to be sent.

### Scheduling a message

With nothing scheduled yet, the button opens straight on **Schedule a message**; otherwise
on the list, where **Schedule a message** opens the form.

- **Message** starts with whatever is typed in the chat input, so a sentence in progress
  carries over. The chat input keeps its text. Enter is a new line, as in the chat input.
- **When** offers **In 5 min**, **In 30 min**, **In 1 hour** (the default), **Tomorrow 9 AM**
  (09:00 local time), **After a duration…** (days, hours, minutes and seconds; hours up to
  23, minutes and seconds up to 59, days up to 365) and **Custom** (an exact date and time
  to the second, in the system's own date picker, which follows the OS language).
- **Schedule** (or Cmd/Ctrl+Enter) saves it. Relative choices count from the moment you
  press it. Leading and trailing spaces of the message are dropped. **Cancel** (**Back**
  when there is a list to return to) leaves without saving.

A refused request shows a toast: an empty message, a time that is not a time, a message
over 100,000 characters, or (when changing one) a message that was sent or cancelled in the
meantime.

### The list

Each row shows the message (three lines; click it for the whole text), a live countdown
("in 9 min", "in 2 h", "in 3 d", "due now") and the exact send time
(`YYYY-MM-DD HH:mm:ss`, local). Rows are soonest first.

- **Edit** opens the form on the message and its exact time (**Custom**); **Save** keeps the
  changes, **Back** returns to the list.
- **Cancel** removes the reservation.

Escape closes the window without reaching the chat underneath (it does not stop a running
turn).

### When the time comes

The message goes to a chat tab that shows the conversation and is sent through that tab's
normal send path: it appears as your own message, and if a turn is still running it joins
the message queue and goes out after it, as a message typed during a turn would. The
reservation is removed once the tab confirms it sent it; until then the IDE may hand it to
the same tab again, and the tab confirms without sending twice. When two tabs show the
conversation, only one gets it.

If no tab shows the conversation at that time, nothing is sent yet: the open tabs of its
project (or every tab, when none belongs to it) show "A scheduled message is due in a
conversation that no tab shows. Open that conversation to send it." The message goes out as
soon as a tab opens the conversation, from History or after an IDE restart. CC GUI never
switches a tab to another conversation by itself, because that would interrupt whatever the
tab is doing.

## Limits

- **Only started conversations.** A new chat has no session until its first message, so
  there is nothing to attach a reservation to; the button appears after the first message.
- **The IDE must be running** at the time. Reservations are saved on disk, so they survive
  a restart: a message whose time passed while the IDE was closed is sent as soon as a tab
  opens its conversation.
- **Text only.** Attachments and images are not kept with a scheduled message.
- **Deleting a conversation** from History deletes its scheduled messages too.
- **Once a second.** The time is checked every second against the computer's clock, so a
  message goes out up to a second late, and right after the computer wakes if it was asleep.

## Where it lives

| Layer | Files |
|-------|-------|
| Reservations and clock | `src/main/java/.../schedule/ScheduledMessages.java`, `ScheduledMessage.java`; kept in `~/.codemoss/scheduled-messages.json` |
| Delivery to tabs | `ui/toolwindow/ScheduledMessageCoordinator.java` |
| Webview bridge | `handler/ScheduledMessageHandler.java` (registered in `ChatWindowDelegate`) |
| Cleanup on delete | `handler/history/HistoryDeleteService.cleanupSessionMetadata` |
| Webview | `webview/src/components/ScheduledMessages/` (hook, dialog, form), the button in `ChatHeader` |

## Messages

Inbound (webview → Java): `get_scheduled_messages` {sessionId} (sent whenever the tab's
conversation changes; also hands over any due messages), `schedule_message`
{sessionId, sendAt, message}, `update_scheduled_message` {id, sessionId, sendAt, message},
`cancel_scheduled_message` {id, sessionId}, `scheduled_message_delivered` {id, sessionId}.

Outbound (Java → webview): `updateScheduledMessages` {sessionId, schedules[], error?} and
`deliverScheduledMessage` (one reservation to send now). `sendAt` is an ISO-8601 instant.
A reservation carries Swttch's field names (`id`, `sessionId`, `sendAt`, `message`, `kind`,
`createdAt`) plus `provider` and `cwd`.
