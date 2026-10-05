import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFullTimestamp, formatMessageTime } from '../../utils/messageTime';

interface MessageTimeProps {
  timestamp?: string;
  className?: string;
}

/**
 * When a message was sent: the time, with as much of the date as it takes to
 * read correctly days later, and the full date and time on hover.
 */
export const MessageTime = memo(function MessageTime({ timestamp, className }: MessageTimeProps) {
  const { i18n } = useTranslation();
  const text = formatMessageTime(timestamp, new Date(), i18n.language);
  if (!text) return null;
  return (
    <span className={className} title={formatFullTimestamp(timestamp, i18n.language)}>
      {text}
    </span>
  );
});
