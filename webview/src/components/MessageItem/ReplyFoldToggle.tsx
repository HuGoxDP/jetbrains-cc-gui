import { memo } from 'react';
import type { TFunction } from 'i18next';
import { useReplyFold } from '../../contexts/ReplyFoldContext';

interface ReplyFoldToggleProps {
  messageKey: string;
  t: TFunction;
}

/**
 * The chevron in a message's header that folds the reply below it away, and
 * unfolds it again. Drawn only for a message with a reply to fold.
 *
 * Its own component so that only these toggles read the fold state: the
 * messages around them are memoized and must not re-render when a reply folds.
 */
export const ReplyFoldToggle = memo(function ReplyFoldToggle({ messageKey, t }: ReplyFoldToggleProps) {
  const fold = useReplyFold();
  if (!fold || !fold.canFold(messageKey)) return null;
  const folded = fold.isFolded(messageKey);
  const label = folded ? t('chat.expandReply') : t('chat.collapseReply');
  return (
    <button
      type="button"
      className="message-copy-btn message-copy-btn-inline reply-fold-toggle"
      onClick={() => fold.toggle(messageKey)}
      title={label}
      aria-label={label}
      aria-expanded={!folded}
    >
      <span className={`codicon ${folded ? 'codicon-chevron-right' : 'codicon-chevron-down'}`} />
    </button>
  );
});
