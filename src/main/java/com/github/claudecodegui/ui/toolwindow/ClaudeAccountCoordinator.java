package com.github.claudecodegui.ui.toolwindow;

import com.github.claudecodegui.account.ClaudeAccountManager;
import com.github.claudecodegui.account.ClaudeAccountStore;
import com.github.claudecodegui.provider.claude.ClaudePlanUsageService;
import com.github.claudecodegui.session.ClaudeSession;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;


/**
 * Effects of the live Claude login changing, across every chat window and project.
 *
 * <p>Every daemon runtime holds the old login's tokens in memory, and a CLI that later
 * refreshes them would write the OLD account back into the live slot. So after a switch
 * each Claude daemon is restarted — immediately when idle, at the end of the turn when a
 * conversation is streaming.
 */
public final class ClaudeAccountCoordinator {

    private static final Logger LOG = Logger.getInstance(ClaudeAccountCoordinator.class);

    /**
     * Sent after an automatic account switch. Plain words on purpose: it shows up in the
     * transcript as the user's message.
     */
    static final String CONTINUE_PROMPT = "Continue exactly where you stopped.";

    private ClaudeAccountCoordinator() {
    }

    /** Apply a completed switch everywhere and refresh every window's account list. */
    public static void afterAccountSwitched() {
        ClaudePlanUsageService.resetForAccountSwitch();
        String accountsJson = ClaudeAccountManager.getInstance().list(false).toString();
        for (ClaudeChatWindow window : ClaudeSDKToolWindow.getAllChatWindows()) {
            try {
                window.onClaudeAccountSwitched(accountsJson);
            } catch (Exception e) {
                LOG.warn("[Accounts] Could not apply the account switch to a chat window: " + e.getMessage());
            }
        }
    }

    /** Push a fresh account list to every window (after save/delete/reorder). */
    public static void broadcastAccounts() {
        String accountsJson = ClaudeAccountManager.getInstance().list(false).toString();
        for (ClaudeChatWindow window : ClaudeSDKToolWindow.getAllChatWindows()) {
            window.pushClaudeAccounts(accountsJson);
        }
    }

    /**
     * A turn in {@code window} stopped on a usage limit. When automatic rotation is on and
     * another account qualifies, switch to it and continue the conversation there.
     *
     * @param attemptsSoFar consecutive automatic switches already made for this request
     * @return true when a switch was started (the caller counts it)
     */
    static boolean onUsageLimitReached(ClaudeChatWindow window, int attemptsSoFar) {
        ClaudeAccountManager manager = ClaudeAccountManager.getInstance();
        ClaudeAccountStore.Registry registry = manager.getStore().readRegistry();
        if (!registry.autoRotate) {
            return false;
        }
        long rotationMembers = registry.accounts.values().stream().filter(a -> a.rotationEnabled).count();
        if (attemptsSoFar >= Math.max(0, rotationMembers - 1)) {
            window.showToast(com.github.claudecodegui.i18n.ClaudeCodeGuiBundle.message("accounts.rotation.exhausted"), "warning");
            return false;
        }

        String fromId = manager.activeAccountId();
        ClaudeSession session = window.getSession();
        String model = session != null ? session.getModel() : null;
        ClaudeAccountManager.RotationChoice choice = manager.selectRotationTarget(fromId, model);
        if (choice == null) {
            window.showToast(com.github.claudecodegui.i18n.ClaudeCodeGuiBundle.message("accounts.rotation.noCandidate"), "warning");
            return false;
        }

        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            try {
                ClaudeAccountStore.StoredAccount target = manager.switchTo(choice.accountId);
                afterAccountSwitched();
                window.showToast(com.github.claudecodegui.i18n.ClaudeCodeGuiBundle.message(
                        "accounts.rotation.switched", target.emailAddress), "info");
                window.sendAutomaticContinuation(CONTINUE_PROMPT);
            } catch (Exception e) {
                LOG.warn("[Accounts] Automatic account switch failed: " + e.getMessage());
                window.showToast(com.github.claudecodegui.i18n.ClaudeCodeGuiBundle.message(
                        "accounts.rotation.failed", String.valueOf(e.getMessage())), "error");
            }
        });
        return true;
    }
}
