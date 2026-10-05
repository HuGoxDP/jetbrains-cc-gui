import type { TFunction } from 'i18next';

interface CollapsedReplyNoticeProps {
  /** How many steps the folded reply holds: its texts and tool calls. */
  count: number;
  onExpand: () => void;
  t: TFunction;
}

/** The line that stands in for a folded reply. Clicking it unfolds the reply. */
export function CollapsedReplyNotice({ count, onExpand, t }: CollapsedReplyNoticeProps) {
  return (
    <button type="button" className="collapsed-reply-notice" onClick={onExpand} title={t('chat.expandReply')}>
      {count > 0 ? t('chat.replyCollapsedCount', { count }) : t('chat.replyCollapsed')}
    </button>
  );
}
