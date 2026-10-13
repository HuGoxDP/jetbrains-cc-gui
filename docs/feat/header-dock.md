# Choose the Header Icons (⋮ Menu)

## Goal

Bring Swttch's customizable header dock to CC GUI. The chat header has six icons (new
session, new tab, search, scheduled messages, history, settings), and every one takes
width from the conversation's title. Not everyone uses all six, and not in the same order.

## Behaviour

- A **⋮** button at the right end of the header opens a menu with every header action,
  in the header's order. The scheduled-messages row shows how many messages wait.
- Each row has three separate spots:
  - the **handle** on the left (⠿) changes the order: drag it, or focus it, press Space,
    move with ↑ ↓ and press Space again;
  - the **middle** runs the action, as its icon does;
  - the **eye** on the right keeps the action in the header or takes it out.
- The header shows the actions whose eye is open, in the menu's order. An action taken
  out of the header stays in the menu.
- Escape while moving a row puts it back; a second Escape (or a click outside) closes the
  menu.
- The arrangement is kept in this IDE for every project.

With nothing changed, the header looks as before: all six icons, in their old order. (In
Swttch the icons start inside ⋮; CC GUI keeps its header as it was and lets you take icons
out.) An action added in a later version joins the end of the menu, out of the header, so
an arrangement you chose never gains an icon by itself.

## Where it lives

| Layer | Files |
|-------|-------|
| Header | `webview/src/components/ChatHeader/ChatHeader.tsx` |
| Menu | `webview/src/components/ChatHeader/HeaderDockMenu.tsx`, `webview/src/styles/less/components/header-dock.less` |
| Arrangement | `webview/src/utils/headerDock.ts` (saved as `headerDock` in the webview's storage) |
