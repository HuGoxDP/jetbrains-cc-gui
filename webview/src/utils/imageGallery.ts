/**
 * The image viewer behind a click on an image in the conversation: it shows that
 * image and lets you step through every other image in the conversation with the
 * arrow keys, the ‹ › buttons or the thumbnail strip. Ported from the Swttch
 * plugin's asset viewer.
 *
 * Built from DOM elements rather than markup strings, like the single-image
 * preview it replaces, so an image URL can never be read as HTML.
 */

export interface ImageGalleryLabels {
  close: string;
  previous: string;
  next: string;
  image: string;
  /** "3 / 7" for the image at [index] (0-based) of [total]. */
  counter: (index: number, total: number) => string;
}

/** The images of the conversation on screen, in reading order. */
export const CONVERSATION_IMAGE_SELECTOR = '.message-image-block img';

export function collectConversationImages(root: ParentNode = document): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(CONVERSATION_IMAGE_SELECTOR)).filter((img) => !!img.getAttribute('src'));
}

function button(className: string, label: string, text: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.title = label;
  el.setAttribute('aria-label', label);
  el.textContent = text;
  return el;
}

/**
 * Show [sources] in [host], starting at [startIndex]. Answers a function that
 * closes the viewer; closing also happens on Esc, on a click outside the image,
 * and on the × button.
 */
export function openImageGallery(
  host: HTMLElement,
  sources: string[],
  startIndex: number,
  labels: ImageGalleryLabels,
): () => void {
  host.innerHTML = '';
  let index = Math.min(Math.max(startIndex, 0), Math.max(sources.length - 1, 0));

  const overlay = document.createElement('div');
  overlay.className = 'image-preview-overlay image-gallery';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const img = document.createElement('img');
  img.className = 'image-preview-content';
  img.alt = labels.image;
  img.onclick = (e) => e.stopPropagation();

  const close = button('image-preview-close', labels.close, '×');
  const previous = button('image-gallery-nav image-gallery-previous', labels.previous, '‹');
  const next = button('image-gallery-nav image-gallery-next', labels.next, '›');
  const counter = document.createElement('div');
  counter.className = 'image-gallery-counter';

  const strip = document.createElement('div');
  strip.className = 'image-gallery-strip';
  strip.onclick = (e) => e.stopPropagation();
  const thumbs = sources.map((src, i) => {
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'image-gallery-thumb';
    thumb.setAttribute('aria-label', labels.counter(i, sources.length));
    const small = document.createElement('img');
    small.src = src;
    small.alt = '';
    thumb.appendChild(small);
    thumb.onclick = (e) => {
      e.stopPropagation();
      show(i);
    };
    strip.appendChild(thumb);
    return thumb;
  });

  function show(i: number): void {
    if (i < 0 || i >= sources.length) return;
    index = i;
    img.src = sources[i];
    counter.textContent = labels.counter(i, sources.length);
    // Kept in place at the ends rather than hidden, so the viewer looks the
    // same whichever image is shown.
    previous.disabled = i === 0;
    next.disabled = i === sources.length - 1;
    thumbs.forEach((thumb, t) => {
      thumb.classList.toggle('active', t === i);
      if (t === i) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
    thumbs[i]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // The chat underneath binds arrows and Escape for its own use, so the keys are
  // taken in the capture phase and stopped while the viewer is open.
  const onKeyDown = (e: KeyboardEvent) => {
    let handled = true;
    if (e.key === 'Escape') dispose();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') show(index - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') show(index + 1);
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(sources.length - 1);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  overlay.onclick = dispose;
  close.onclick = (e) => {
    e.stopPropagation();
    dispose();
  };
  previous.onclick = (e) => {
    e.stopPropagation();
    show(index - 1);
  };
  next.onclick = (e) => {
    e.stopPropagation();
    show(index + 1);
  };

  overlay.append(img, close, counter);
  if (sources.length > 1) overlay.append(previous, next, strip);
  host.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown, true);
  show(index);
  return dispose;
}
