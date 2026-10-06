import type { TFunction } from 'i18next';
import type { ClaudeContentBlock } from '../../../types';
import { collectConversationImages, openImageGallery } from '../../../utils/imageGallery';

const IMAGE_BLOCK_STYLE: React.CSSProperties = { cursor: 'pointer' };

function getImageStyle(isUser: boolean): React.CSSProperties {
  return {
    maxWidth: isUser ? '200px' : '100%',
    maxHeight: isUser ? '150px' : 'auto',
    borderRadius: '8px',
    objectFit: 'contain',
  };
}

interface ImageBlockProps {
  block: Extract<ClaudeContentBlock, { type: 'image' }>;
  messageType: string;
  t: TFunction;
}

export function ImageBlock({ block, messageType, t }: ImageBlockProps) {
  const handleImagePreview = (clicked: HTMLElement) => {
    const previewRoot = document.getElementById('image-preview-root');
    if (!previewRoot || !block.src) return;

    // Every image of the conversation on screen, so the viewer can step from
    // this one to the others.
    const images = collectConversationImages();
    const own = clicked.querySelector('img');
    const found = own ? images.indexOf(own) : -1;
    const sources = found >= 0 ? images.map((img) => img.getAttribute('src') ?? '') : [block.src];
    openImageGallery(previewRoot, sources, Math.max(found, 0), {
      close: t('chat.imageGallery.close'),
      previous: t('chat.imageGallery.previous'),
      next: t('chat.imageGallery.next'),
      image: t('chat.imagePreview'),
      counter: (index, total) => t('chat.imageGallery.counter', { current: index + 1, total }),
    });
  };

  return (
    <div
      className={`message-image-block ${messageType === 'user' ? 'user-image' : ''}`}
      onClick={(e) => handleImagePreview(e.currentTarget)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleImagePreview(e.currentTarget);
        }
      }}
      style={IMAGE_BLOCK_STYLE}
      title={t('chat.clickToPreview')}
    >
      <img
        src={block.src}
        alt={t('chat.userUploadedImage')}
        style={getImageStyle(messageType === 'user')}
      />
    </div>
  );
}
