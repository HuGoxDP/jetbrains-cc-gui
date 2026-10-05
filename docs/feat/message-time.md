# Message Times That Still Read Correctly Days Later

## Goal

Bring the dated message times of the Claude Code GUI ("Swttch") plugin's message
footer to CC GUI. A message showed its time only (`14:05`), which reads as today in a
session reopened next week.

## Behaviour

The time next to each message you typed, and the reply time in the footer under a
finished reply (before "This reply took …"), now carry as much of the date as they
need:

| Sent              | Shown              |
|-------------------|--------------------|
| today             | `14:05`            |
| the last 6 days   | `Thu 14:05`        |
| earlier this year | `Sep 28 14:05`     |
| another year      | `6/27/2025 14:05`  |

Hovering a time shows the full date and time. Weekday and month names, and the order
of the parts, follow the interface language (`Intl.DateTimeFormat`), so there are no
strings to translate. The 24-hour clock CC GUI already used is kept.

The footer shows wherever it did before: under a reply whose duration is known. The
time is added to it; no new footer is drawn.

## Where it lives

| Part | File |
|------|------|
| Formatting | `webview/src/utils/messageTime.ts` |
| Component | `webview/src/components/MessageItem/MessageTime.tsx` |
| User message header | `components/MessageItem/MessageActionButtons.tsx` |
| Reply footer | `components/MessageItem/MessageDurationFooter.tsx` |
| Tests | `utils/messageTime.test.ts` |
