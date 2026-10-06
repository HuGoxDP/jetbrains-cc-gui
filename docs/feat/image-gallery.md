# Step Through the Conversation's Images

## Goal

Bring the image viewer of the Claude Code GUI ("Swttch") plugin to CC GUI: an image
opened from the conversation is no longer a dead end. From it you can go to every
other image in the conversation without closing it.

## Behaviour

- **Click an image** in a message (a screenshot you attached, for example). It opens
  as before, now with:
  - **‹ ›** buttons on the sides and the **arrow keys** (← / ↑ previous, → / ↓ next;
    Home / End first and last) to step through the conversation's images in reading
    order;
  - a **counter** in the top-left corner ("2 / 3");
  - a **thumbnail strip** at the bottom: every image of the conversation, the one
    shown framed; click one to jump to it.
- The ‹ › buttons stay in place at the ends, dimmed, so the viewer looks the same
  whichever image is shown.
- **Esc**, the × button or a click outside the image closes it. While it is open the
  arrows and Esc belong to the viewer and do not reach the chat input.
- A conversation with a single image shows it without buttons or strip, as before.

## Limits

- **Only the part of the conversation on screen.** The viewer collects the images of
  the messages that are shown; images in earlier messages that have not been loaded
  (or revealed) yet are not in the strip until they are.
- **Images in messages only.** Images inside Markdown answers keep their own preview,
  and images a tool returned are not included, as in Swttch.
- Swttch also has a separate "Assets" screen that lists a whole session's images from
  the transcript on disk; CC GUI has no such screen.

## How it works

`utils/imageGallery.ts` builds the viewer from DOM elements (never from markup
strings, so an image URL cannot be read as HTML), like the single-image preview it
replaces, in the existing `#image-preview-root`. `collectConversationImages()` reads
`.message-image-block img` in document order; `ImageBlock` passes the list and the
index of the clicked image. Keys are taken in the capture phase on `document` and
stopped, and the listener is removed when the viewer closes.

## Where it lives

| Part | File |
|------|------|
| Viewer | `webview/src/utils/imageGallery.ts`, styles in `styles/less/components/preview.less` |
| Opening it | `webview/src/components/MessageItem/blocks/ImageBlock.tsx` |
| Strings | `chat.imageGallery.*` in all locales |
| Tests | `webview/src/utils/imageGallery.test.ts` |

Checked in the browser (webview dev server) with a conversation holding three
attached images: clicking the second opens "2 / 3" with three thumbnails; → shows
"3 / 3" with › disabled; ← ← shows "1 / 3" with ‹ disabled; Esc closes. Not checked
inside an IDE.
