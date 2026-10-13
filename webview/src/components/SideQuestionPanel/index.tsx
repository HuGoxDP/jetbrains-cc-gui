import { useTranslation } from 'react-i18next';
import MarkdownBlock from '../MarkdownBlock';
import { dismissSideQuestion, useSideQuestion } from '../../utils/sideCommands';
import './SideQuestionPanel.css';

/**
 * The answer to `/btw` (ported from Swttch), above the input: the question, the answer,
 * and a note that neither went into the conversation. A new `/btw` replaces it; the
 * close button puts it away.
 */
export function SideQuestionPanel() {
  const { t } = useTranslation();
  const sideQuestion = useSideQuestion();
  if (!sideQuestion) return null;

  const { status, question, answer, reason } = sideQuestion;

  return (
    <section className="side-question-panel" aria-label={t('chat.sideQuestion.title')}>
      <header className="side-question-header">
        <span className="codicon codicon-comment" aria-hidden="true" />
        <span className="side-question-label">{t('chat.sideQuestion.title')}</span>
        <span className="side-question-question" title={question}>{question}</span>
        <button
          type="button"
          className="side-question-close"
          onClick={dismissSideQuestion}
          title={t('chat.sideQuestion.close')}
          aria-label={t('chat.sideQuestion.close')}
        >
          <span className="codicon codicon-close" />
        </button>
      </header>
      <div className="side-question-body" aria-live="polite">
        {status === 'pending' && (
          <span className="side-question-pending">
            <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
            {t('chat.sideQuestion.thinking')}
          </span>
        )}
        {status === 'answered' && answer && <MarkdownBlock content={answer.response} />}
        {status === 'failed' && (
          <span className="side-question-error">
            {t(`chat.sideQuestion.errors.${reason ?? 'failed'}`, {
              defaultValue: t('chat.sideQuestion.errors.failed', { reason: reason ?? '' }),
              reason: reason ?? '',
            })}
          </span>
        )}
      </div>
      <footer className="side-question-note">{t('chat.sideQuestion.notInConversation')}</footer>
    </section>
  );
}
