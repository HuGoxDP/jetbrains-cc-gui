import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectConversationImages, openImageGallery, type ImageGalleryLabels } from './imageGallery';

const labels: ImageGalleryLabels = {
  close: 'Close',
  previous: 'Previous image',
  next: 'Next image',
  image: 'Preview',
  counter: (i, n) => `${i + 1} / ${n}`,
};

const press = (key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.activeElement?.dispatchEvent(event) ?? document.dispatchEvent(event);
  return event;
};

let host: HTMLElement;
const shown = () => host.querySelector<HTMLImageElement>('.image-preview-content')?.getAttribute('src');
const counter = () => host.querySelector('.image-gallery-counter')?.textContent;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectConversationImages', () => {
  it('lists the images of the conversation in reading order', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="message-image-block"><img src="a.png"></div>
      <div class="markdown"><img src="not-an-attachment.png"></div>
      <div class="message-image-block user-image"><img src="b.png"></div>`);
    expect(collectConversationImages().map((img) => img.getAttribute('src'))).toEqual(['a.png', 'b.png']);
  });
});

describe('openImageGallery', () => {
  it('starts at the clicked image and steps with the arrow keys, stopping at the ends', () => {
    openImageGallery(host, ['a', 'b', 'c'], 1, labels);
    expect(shown()).toBe('b');
    expect(counter()).toBe('2 / 3');

    press('ArrowRight');
    expect(shown()).toBe('c');
    press('ArrowRight');
    expect(shown()).toBe('c');
    expect(host.querySelector<HTMLButtonElement>('.image-gallery-next')?.disabled).toBe(true);

    press('ArrowLeft');
    press('ArrowUp');
    expect(shown()).toBe('a');
    expect(host.querySelector<HTMLButtonElement>('.image-gallery-previous')?.disabled).toBe(true);
    press('End');
    expect(counter()).toBe('3 / 3');
  });

  it('keeps the keys it uses from reaching the chat underneath', () => {
    let reached = 0;
    const listener = () => { reached += 1; };
    window.addEventListener('keydown', listener);
    openImageGallery(host, ['a', 'b'], 0, labels);
    const event = press('ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(reached).toBe(0);
    window.removeEventListener('keydown', listener);
  });

  it('jumps to an image from the thumbnail strip and marks it', () => {
    openImageGallery(host, ['a', 'b', 'c'], 0, labels);
    host.querySelectorAll<HTMLButtonElement>('.image-gallery-thumb')[2].click();
    expect(shown()).toBe('c');
    expect(host.querySelectorAll('.image-gallery-thumb')[2].classList.contains('active')).toBe(true);
    expect(host.querySelector('.image-gallery')).not.toBeNull();
  });

  it('closes on Escape, on a click outside the image and on ×, and stops listening', () => {
    openImageGallery(host, ['a', 'b'], 0, labels);
    press('Escape');
    expect(host.querySelector('.image-gallery')).toBeNull();
    // Closed, it leaves the arrows to the chat again.
    expect(press('ArrowRight').defaultPrevented).toBe(false);

    openImageGallery(host, ['a', 'b'], 0, labels);
    host.querySelector<HTMLImageElement>('.image-preview-content')!.click();
    expect(host.querySelector('.image-gallery')).not.toBeNull();
    host.querySelector<HTMLElement>('.image-gallery')!.click();
    expect(host.querySelector('.image-gallery')).toBeNull();

    openImageGallery(host, ['a'], 0, labels);
    host.querySelector<HTMLButtonElement>('.image-preview-close')!.click();
    expect(host.querySelector('.image-gallery')).toBeNull();
  });

  it('shows a single image without navigation', () => {
    openImageGallery(host, ['only'], 0, labels);
    expect(host.querySelector('.image-gallery-nav')).toBeNull();
    expect(host.querySelector('.image-gallery-strip')).toBeNull();
    expect(counter()).toBe('1 / 1');
  });
});
