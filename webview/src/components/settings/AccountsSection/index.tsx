import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../../ConfirmDialog';
import { copyToClipboard } from '../../../utils/copyUtils';
import { openBrowserExternal } from '../../../utils/bridge';
import {
  type ClaudeAccount,
  type ClaudeAccountUsageEvent,
  type ClaudeRateLimits,
  type UsageWindowView,
  formatResetIn,
  moveAccount,
  planLabel,
  usageKey,
  usageLevel,
  usageWindows,
  LIVE_USAGE_KEY,
} from './claudeAccounts';
import { useClaudeAccounts, type ClaudeLoginState, type LoginMethod } from './useClaudeAccounts';
import styles from './style.module.less';

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface AccountsSectionProps {
  addToast?: (message: string, type?: ToastType) => void;
}

const AccountsSection = ({ addToast }: AccountsSectionProps) => {
  const { t } = useTranslation();
  const accounts = useClaudeAccounts(addToast);
  const { state, usage, refreshing, pendingAction, login } = accounts;
  const [deleteTarget, setDeleteTarget] = useState<ClaudeAccount | null>(null);

  const ids = useMemo(() => state?.accounts.map((a) => a.id) ?? [], [state]);
  const unsavedLive = !!state && state.liveLoggedIn && !state.liveSaved;
  const anyRefreshing = refreshing.size > 0;

  return (
    <div className={styles.configSection}>
      <h3 className={styles.sectionTitle}>{t('settings.accounts.title')}</h3>
      <p className={styles.sectionDesc}>{t('settings.accounts.description')}</p>

      <div className={styles.toolbar}>
        <AddAccountButton disabled={login.phase === 'running'} onStart={accounts.startLogin} />
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={accounts.saveCurrent}
          disabled={pendingAction === 'save_current_claude_account'}
          title={t('settings.accounts.saveCurrentHint')}
        >
          <span className="codicon codicon-save" />
          {t('settings.accounts.saveCurrent')}
        </button>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => accounts.refreshUsage([])}
          disabled={anyRefreshing || !state}
        >
          <span className={`codicon codicon-refresh ${anyRefreshing ? 'codicon-modifier-spin' : ''}`} />
          {t('settings.accounts.refreshUsage')}
        </button>
      </div>

      <LoginPanel
        login={login}
        onSubmitCode={accounts.submitLoginCode}
        onCancel={accounts.cancelLogin}
        onDismissError={accounts.dismissLoginError}
        addToast={addToast}
      />

      {accounts.loading && (
        <div className={styles.notice}>
          <span className="codicon codicon-loading codicon-modifier-spin" />
          <span>{t('settings.accounts.loading')}</span>
        </div>
      )}

      {accounts.loadFailed && (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <span className="codicon codicon-error" />
          <span>{t('settings.accounts.loadFailed')}</span>
          <button type="button" className={styles.linkButton} onClick={accounts.reload}>
            {t('settings.accounts.retry')}
          </button>
        </div>
      )}

      {state && (
        <>
          <label className={styles.rotateCard}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={state.autoRotate}
              onChange={(e) => accounts.setAutoRotate(e.target.checked)}
            />
            <span className={styles.toggleSlider} />
            <span className={styles.rotateText}>
              <span className={styles.rotateTitle}>{t('settings.accounts.autoRotate')}</span>
              <span className={styles.rotateHint}>{t('settings.accounts.autoRotateHint')}</span>
            </span>
          </label>

          {unsavedLive && (
            <div className={styles.notice}>
              <span className="codicon codicon-info" />
              <span>{t('settings.accounts.unsavedLive', { email: state.activeEmail ?? '' })}</span>
              <button type="button" className={styles.linkButton} onClick={accounts.saveCurrent}>
                {t('settings.accounts.saveCurrent')}
              </button>
            </div>
          )}

          {unsavedLive && usage[LIVE_USAGE_KEY] && (
            <div className={`${styles.card} ${styles.active}`}>
              <div className={styles.cardHeader}>
                <span className={styles.email}>{state.activeEmail}</span>
                <span className={styles.badgeActive}>{t('settings.accounts.active')}</span>
              </div>
              <UsageBlock
                event={usage[LIVE_USAGE_KEY]}
                stored={null}
                storedAt={0}
                refreshing={refreshing.has(LIVE_USAGE_KEY)}
                unsupported={false}
              />
            </div>
          )}

          {state.accounts.length === 0 && !unsavedLive && (
            <div className={styles.empty}>
              <span className="codicon codicon-account" />
              <p>{t('settings.accounts.empty')}</p>
            </div>
          )}

          <div className={styles.list}>
            {state.accounts.map((account, index) => (
              <AccountCard
                key={account.id}
                account={account}
                index={index}
                total={state.accounts.length}
                event={usage[usageKey(account.id)]}
                refreshing={refreshing.has(account.id)}
                isolatedUsageSupported={state.isolatedUsageSupported}
                switching={pendingAction === 'switch_claude_account'}
                onSwitch={() => accounts.switchTo(account.id)}
                onMove={(delta) => accounts.reorder(moveAccount(ids, account.id, delta))}
                onRotationChange={(enabled) => accounts.setRotation(account.id, enabled)}
                onRefresh={() => accounts.refreshUsage([account.id])}
                onDelete={() => setDeleteTarget(account)}
              />
            ))}
          </div>

          {!state.isolatedUsageSupported && state.accounts.length > 1 && (
            <p className={styles.footnote}>
              <span className="codicon codicon-info" /> {t('settings.accounts.keychainNote')}
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t('settings.accounts.deleteTitle')}
        message={t('settings.accounts.deleteMessage', { email: deleteTarget?.emailAddress ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={() => {
          if (deleteTarget) accounts.remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

const AddAccountButton = ({ disabled, onStart }: { disabled: boolean; onStart: (method: LoginMethod) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.menuWrapper}>
      <button
        type="button"
        className={styles.btnPrimary}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="codicon codicon-add" />
        {t('settings.accounts.add')}
        <span className="codicon codicon-chevron-down" />
      </button>
      {open && (
        <div className={styles.menu} role="menu" onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => { setOpen(false); onStart('claudeai'); }}
          >
            <span className="codicon codicon-account" />
            {t('settings.accounts.loginClaudeAi')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => { setOpen(false); onStart('console'); }}
          >
            <span className="codicon codicon-key" />
            {t('settings.accounts.loginConsole')}
          </button>
        </div>
      )}
    </div>
  );
};

interface LoginPanelProps {
  login: ClaudeLoginState;
  onSubmitCode: (code: string) => void;
  onCancel: () => void;
  onDismissError: () => void;
  addToast?: (message: string, type?: ToastType) => void;
}

const LoginPanel = ({ login, onSubmitCode, onCancel, onDismissError, addToast }: LoginPanelProps) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  if (login.phase === 'idle' && login.error) {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`}>
        <span className="codicon codicon-error" />
        <span className={styles.preWrap}>{login.error}</span>
        <button type="button" className={styles.linkButton} onClick={onDismissError}>
          {t('common.close')}
        </button>
      </div>
    );
  }
  if (login.phase !== 'running') return null;

  return (
    <div className={styles.loginPanel}>
      <div className={styles.loginHeader}>
        <span className="codicon codicon-loading codicon-modifier-spin" />
        <span>{t('settings.accounts.loginWaiting')}</span>
      </div>
      {login.url && (
        <div className={styles.loginUrlRow}>
          <code className={styles.loginUrl} title={login.url}>{login.url}</code>
          <button type="button" className={styles.btnSecondary} onClick={() => openBrowserExternal(login.url ?? undefined)}>
            <span className="codicon codicon-link-external" />
            {t('settings.accounts.openLink')}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={async () => {
              const ok = await copyToClipboard(login.url ?? '');
              addToast?.(ok ? t('settings.accounts.linkCopied') : t('settings.accounts.toast.failed'), ok ? 'success' : 'error');
            }}
          >
            <span className="codicon codicon-copy" />
            {t('settings.accounts.copyLink')}
          </button>
        </div>
      )}
      <form
        className={styles.codeRow}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitCode(code);
          setCode('');
        }}
      >
        <input
          className={styles.codeInput}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('settings.accounts.codePlaceholder')}
          aria-label={t('settings.accounts.codePlaceholder')}
        />
        <button type="submit" className={styles.btnSecondary} disabled={!code.trim()}>
          {t('settings.accounts.submitCode')}
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </form>
      <small className={styles.hint}>{t('settings.accounts.codeHint')}</small>
    </div>
  );
};

interface AccountCardProps {
  account: ClaudeAccount;
  index: number;
  total: number;
  event: ClaudeAccountUsageEvent | undefined;
  refreshing: boolean;
  isolatedUsageSupported: boolean;
  switching: boolean;
  onSwitch: () => void;
  onMove: (delta: -1 | 1) => void;
  onRotationChange: (enabled: boolean) => void;
  onRefresh: () => void;
  onDelete: () => void;
}

const AccountCard = ({
  account,
  index,
  total,
  event,
  refreshing,
  isolatedUsageSupported,
  switching,
  onSwitch,
  onMove,
  onRotationChange,
  onRefresh,
  onDelete,
}: AccountCardProps) => {
  const { t } = useTranslation();
  const plan = planLabel(account);
  const active = account.active === true;
  const canQuery = active || isolatedUsageSupported;

  return (
    <div className={`${styles.card} ${active ? styles.active : ''}`} data-testid="claude-account-card">
      <div className={styles.cardHeader}>
        <div className={styles.identity}>
          <span className={styles.email}>{account.emailAddress}</span>
          {active && <span className={styles.badgeActive}>{t('settings.accounts.active')}</span>}
          {plan && <span className={styles.badge}>{plan}</span>}
          {account.organizationName && (
            <span className={styles.org} title={account.organizationName}>{account.organizationName}</span>
          )}
        </div>
        <div className={styles.cardActions}>
          {!active && (
            <button
              type="button"
              className={styles.btnPrimarySmall}
              onClick={onSwitch}
              disabled={switching || account.hasSnapshot === false}
            >
              {t('settings.accounts.switch')}
            </button>
          )}
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title={t('settings.accounts.moveUp')}
            aria-label={t('settings.accounts.moveUp')}
          >
            <span className="codicon codicon-arrow-up" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title={t('settings.accounts.moveDown')}
            aria-label={t('settings.accounts.moveDown')}
          >
            <span className="codicon codicon-arrow-down" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRefresh}
            disabled={refreshing || !canQuery}
            title={t('settings.accounts.refreshUsage')}
            aria-label={t('settings.accounts.refreshUsage')}
          >
            <span className={`codicon codicon-refresh ${refreshing ? 'codicon-modifier-spin' : ''}`} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.danger}`}
            onClick={onDelete}
            title={t('settings.accounts.delete')}
            aria-label={t('settings.accounts.delete')}
          >
            <span className="codicon codicon-trash" />
          </button>
        </div>
      </div>

      <UsageBlock
        event={event}
        stored={account.usage ?? null}
        storedAt={account.usageUpdatedAt ?? 0}
        refreshing={refreshing}
        unsupported={!canQuery}
      />

      <label className={styles.rotationRow}>
        <input
          type="checkbox"
          checked={account.rotationEnabled !== false}
          onChange={(e) => onRotationChange(e.target.checked)}
        />
        <span>{t('settings.accounts.inRotation')}</span>
      </label>
    </div>
  );
};

interface UsageBlockProps {
  event: ClaudeAccountUsageEvent | undefined;
  stored: ClaudeRateLimits | null;
  storedAt: number;
  refreshing: boolean;
  unsupported: boolean;
}

const UsageBlock = ({ event, stored, storedAt, refreshing, unsupported }: UsageBlockProps) => {
  const { t, i18n } = useTranslation();
  // A fresh successful reading wins; otherwise fall back to what the registry remembers.
  const limits = event?.success && event.rateLimits ? event.rateLimits : stored;
  const updatedAt = event?.success && event.rateLimits ? event.updatedAt : storedAt;
  const windows = usageWindows(limits);
  const now = new Date();

  let status: string | null = null;
  if (event && !event.success) {
    status = t(`settings.accounts.usageError.${event.errorKind ?? 'unknown'}`, {
      defaultValue: t('settings.accounts.usageError.unknown'),
    });
  } else if (event?.success && event.rateLimitsAvailable === false) {
    status = t('settings.accounts.usageNotAvailable');
  } else if (windows.length === 0) {
    if (refreshing) status = t('settings.accounts.usageLoading');
    else if (unsupported) status = t('settings.accounts.usageKeychain');
    else status = t('settings.accounts.usageUnknown');
  }

  return (
    <div className={styles.usage}>
      {windows.map((w) => (
        <UsageBar key={w.key} window={w} now={now} locale={i18n.language} />
      ))}
      {status && (
        <div className={styles.usageStatus} title={event?.error ?? undefined}>
          {status}
        </div>
      )}
      {windows.length > 0 && updatedAt > 0 && (
        <div className={styles.usageUpdated}>
          {refreshing
            ? t('settings.accounts.usageLoading')
            : t('settings.accounts.updated', { time: new Date(updatedAt).toLocaleTimeString(i18n.language) })}
        </div>
      )}
    </div>
  );
};

const UsageBar = ({ window: w, now, locale }: { window: UsageWindowView; now: Date; locale: string }) => {
  const { t } = useTranslation();
  const label = w.label ?? (w.labelKey ? t(w.labelKey) : w.key);
  const level = usageLevel(w.pct);
  return (
    <div className={styles.usageRow}>
      <span className={styles.usageLabel}>{label}</span>
      <span className={styles.usageTrack}>
        <span
          className={`${styles.usageFill} ${styles[level]}`}
          style={{ width: `${w.pct}%` }}
        />
      </span>
      <span className={styles.usagePct}>{Math.round(w.pct)}%</span>
      <span className={styles.usageReset}>
        {w.resetsAt ? t('settings.accounts.resets', { when: formatResetIn(w.resetsAt, now, locale) }) : ''}
      </span>
    </div>
  );
};

export default AccountsSection;
