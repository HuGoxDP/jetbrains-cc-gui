# Fold the Permission Request to One Line

## Goal

Bring Swttch's collapsible prompt panels to the permission request. When Claude asks to
run a command or edit a file, the request covers the lower part of the chat, which is
usually where Claude explained why it wants to. The question and plan dialogs could
already be folded away; the permission request could not.

## Behaviour

- The **⌄** button at the right of the request's title folds it to one line just above
  the chat input. The line keeps the title ("Execute Command" and the like) and the
  countdown, so what is waiting stays in view.
- **Folding is not answering.** Claude keeps waiting, and the countdown keeps running;
  when it runs out, the request is declined as before.
- **Click anywhere on the line** (or focus it and press Enter or Space) to open the
  request again, with the choice you had highlighted.
- **The keys are off while folded.** `1`, `2`, `3`, the arrows and Enter do nothing while
  the request is folded, so a key pressed while reading can never answer it.
- **The next request arrives open.** Folding applies to one request. The same request
  shown again (after switching tabs or a reload) stays folded.

## Where it lives

| Layer | Files |
|-------|-------|
| Dialog | `webview/src/components/PermissionDialog.tsx` (`isCollapsed`, saved with the request's draft; the bar is placed above `.input-area`) |
| Styles | `webview/src/styles/less/components/permission.less` (`.permission-dialog-v3-collapsed`) |
| Strings | `permission.foldPanel`, `permission.unfoldPanel` in every locale |
