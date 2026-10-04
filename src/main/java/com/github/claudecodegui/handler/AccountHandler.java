package com.github.claudecodegui.handler;

import com.github.claudecodegui.account.ClaudeAccountManager;
import com.github.claudecodegui.account.ClaudeAccountStore;
import com.github.claudecodegui.account.ClaudeLoginService;
import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.provider.claude.ClaudePlanUsageService;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.ui.toolwindow.ClaudeAccountCoordinator;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Webview bridge for Claude multi-account management and per-account plan usage.
 *
 * <p>Inbound: {@code get_claude_accounts}, {@code save_current_claude_account},
 * {@code switch_claude_account}, {@code delete_claude_account}, {@code reorder_claude_accounts},
 * {@code set_claude_account_rotation}, {@code set_claude_auto_rotate},
 * {@code refresh_claude_account_usage}, {@code start_claude_login},
 * {@code submit_claude_login_code}, {@code cancel_claude_login}.
 *
 * <p>Outbound: {@code updateClaudeAccounts}, {@code onClaudeAccountUsage},
 * {@code onClaudeAccountAction}, {@code onClaudeLoginEvent}.
 */
public class AccountHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(AccountHandler.class);

    private static final String[] SUPPORTED_TYPES = {
            "get_claude_accounts",
            "save_current_claude_account",
            "switch_claude_account",
            "delete_claude_account",
            "reorder_claude_accounts",
            "set_claude_account_rotation",
            "set_claude_auto_rotate",
            "refresh_claude_account_usage",
            "start_claude_login",
            "submit_claude_login_code",
            "cancel_claude_login",
    };

    /** Background refresh of the live login's usage, shared by every window. */
    private static final long BACKGROUND_REFRESH_INTERVAL_MS = TimeUnit.MINUTES.toMillis(5);
    private static final AtomicLong LAST_BACKGROUND_REFRESH = new AtomicLong();
    private static final AtomicBoolean REFRESH_RUNNING = new AtomicBoolean();

    private final Gson gson = new Gson();

    public AccountHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES.clone();
    }

    @Override
    public boolean handle(String type, String content) {
        if (!matchesType(type, SUPPORTED_TYPES)) {
            return false;
        }
        JsonObject payload = parse(content);
        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            try {
                dispatch(type, payload);
            } catch (Exception e) {
                LOG.warn("[Accounts] " + type + " failed: " + e.getMessage(), e);
                reportAction(type, false, e.getMessage(), null);
            }
        });
        return true;
    }

    private void dispatch(String type, JsonObject payload) throws Exception {
        ClaudeAccountManager manager = ClaudeAccountManager.getInstance();
        switch (type) {
            case "get_claude_accounts":
                pushAccounts(manager.list(bool(payload, "autoCapture", true)));
                break;
            case "save_current_claude_account": {
                ClaudeAccountStore.StoredAccount saved = manager.saveCurrent();
                reportAction(type, true, null, saved.emailAddress);
                ClaudeAccountCoordinator.broadcastAccounts();
                break;
            }
            case "switch_claude_account": {
                ClaudeAccountStore.StoredAccount target = manager.switchTo(requireId(payload));
                ClaudeAccountCoordinator.afterAccountSwitched();
                reportAction(type, true, null, target.emailAddress);
                refreshUsage(List.of(target.id), false);
                break;
            }
            case "delete_claude_account":
                manager.delete(requireId(payload));
                reportAction(type, true, null, null);
                ClaudeAccountCoordinator.broadcastAccounts();
                break;
            case "reorder_claude_accounts": {
                List<String> ids = new ArrayList<>();
                if (payload.has("ids") && payload.get("ids").isJsonArray()) {
                    for (JsonElement id : payload.getAsJsonArray("ids")) {
                        ids.add(id.getAsString());
                    }
                }
                manager.reorder(ids);
                ClaudeAccountCoordinator.broadcastAccounts();
                break;
            }
            case "set_claude_account_rotation":
                manager.setRotationEnabled(requireId(payload), bool(payload, "enabled", true));
                ClaudeAccountCoordinator.broadcastAccounts();
                break;
            case "set_claude_auto_rotate":
                manager.setAutoRotate(bool(payload, "enabled", false));
                ClaudeAccountCoordinator.broadcastAccounts();
                break;
            case "refresh_claude_account_usage": {
                List<String> ids = new ArrayList<>();
                if (payload.has("ids") && payload.get("ids").isJsonArray()) {
                    for (JsonElement id : payload.getAsJsonArray("ids")) {
                        ids.add(id.getAsString());
                    }
                }
                refreshUsage(ids, bool(payload, "includeBehaviors", false));
                break;
            }
            case "start_claude_login":
                startLogin(payload.has("method") ? payload.get("method").getAsString() : "claudeai");
                break;
            case "submit_claude_login_code": {
                String code = payload.has("code") ? payload.get("code").getAsString() : "";
                boolean ok = ClaudeLoginService.submitCode(code);
                reportAction(type, ok, ok ? null : "No sign-in is waiting for a code", null);
                break;
            }
            case "cancel_claude_login":
                ClaudeLoginService.cancel();
                break;
            default:
                break;
        }
    }

    // ==================== Usage ====================

    /**
     * Read plan usage for the given accounts (all saved accounts when {@code ids} is empty).
     * The live login is asked directly; other accounts are asked in an isolated sandbox
     * where the platform allows it. Lookups run one after another — they are cheap for the
     * CLI but each spawns a process, and there is no hurry worth hammering the API for.
     */
    private void refreshUsage(List<String> ids, boolean includeBehaviors) {
        ClaudeAccountManager manager = ClaudeAccountManager.getInstance();
        ClaudeAccountStore.Registry registry = manager.getStore().readRegistry();
        String activeId = manager.activeAccountId();
        List<String> targets = new ArrayList<>(ids.isEmpty() ? registry.order : ids);
        // Live login first: it is the one the user is looking at.
        if (activeId != null && targets.remove(activeId)) {
            targets.add(0, activeId);
        }
        if (ids.isEmpty() && activeId == null && manager.readLiveLogin().loggedIn) {
            // A live login that is not saved yet still deserves its numbers.
            targets.add(0, null);
        }

        ClaudeSDKBridge bridge = context.getClaudeSDKBridge();
        String cwd = context.resolveEffectiveWorkingDirectory();
        for (String id : targets) {
            boolean active = id == null || id.equals(activeId);
            JsonObject result;
            if (active) {
                result = await(bridge.getPlanUsage(cwd, null, includeBehaviors));
                applyLiveResult(manager, id, result);
            } else if (manager.isIsolatedUsageSupported() && registry.accounts.containsKey(id)) {
                result = queryInSandbox(manager, bridge, cwd, id);
            } else {
                continue;
            }
            pushUsage(id, active, result);
        }
        ClaudeAccountCoordinator.broadcastAccounts();
    }

    private JsonObject queryInSandbox(ClaudeAccountManager manager, ClaudeSDKBridge bridge, String cwd, String id) {
        Path sandbox = null;
        try {
            sandbox = manager.prepareUsageSandbox(id);
            JsonObject result = await(bridge.getPlanUsage(cwd, sandbox.toString(), false));
            JsonObject rateLimits = rateLimits(result);
            if (rateLimits != null) {
                manager.recordUsage(id, rateLimits);
            }
            return result;
        } catch (Exception e) {
            JsonObject failure = new JsonObject();
            failure.addProperty("success", false);
            failure.addProperty("error", e.getMessage());
            failure.addProperty("errorKind", "unknown");
            return failure;
        } finally {
            if (sandbox != null) {
                manager.finishUsageSandbox(id, sandbox);
            }
        }
    }

    private static void applyLiveResult(ClaudeAccountManager manager, String id, JsonObject result) {
        JsonObject rateLimits = rateLimits(result);
        if (rateLimits == null) {
            return;
        }
        ClaudePlanUsageService.cachePlanUsage(rateLimits);
        manager.recordUsage(id, rateLimits);
    }

    /**
     * Keep the composer's usage indicator fresh: at most one lookup every few minutes across
     * all windows, and only while Claude runs on its own subscription login.
     */
    public static void refreshLiveUsageInBackground(HandlerContext context, Runnable onUpdated) {
        if (context.getSettingsService() == null || !context.getSettingsService().isCliLoginProviderActive()) {
            return;
        }
        long now = System.currentTimeMillis();
        long last = LAST_BACKGROUND_REFRESH.get();
        if (now - last < BACKGROUND_REFRESH_INTERVAL_MS || !LAST_BACKGROUND_REFRESH.compareAndSet(last, now)) {
            return;
        }
        if (!REFRESH_RUNNING.compareAndSet(false, true)) {
            return;
        }
        context.getClaudeSDKBridge()
                .getPlanUsage(context.resolveEffectiveWorkingDirectory(), null, false)
                .whenComplete((result, error) -> {
                    try {
                        if (result != null && rateLimits(result) != null) {
                            ClaudeAccountManager manager = ClaudeAccountManager.getInstance();
                            applyLiveResult(manager, manager.activeAccountId(), result);
                            if (onUpdated != null) {
                                onUpdated.run();
                            }
                        }
                    } finally {
                        REFRESH_RUNNING.set(false);
                    }
                });
    }

    /** {@code usage.rate_limits} of a successful lookup, or null. */
    private static JsonObject rateLimits(JsonObject result) {
        if (result == null || !result.has("success") || !result.get("success").getAsBoolean()) {
            return null;
        }
        JsonElement usage = result.get("usage");
        if (usage == null || !usage.isJsonObject()) {
            return null;
        }
        JsonElement limits = usage.getAsJsonObject().get("rate_limits");
        return limits != null && limits.isJsonObject() ? limits.getAsJsonObject() : null;
    }

    private void pushUsage(String accountId, boolean active, JsonObject result) {
        JsonObject out = new JsonObject();
        if (accountId != null) {
            out.addProperty("accountId", accountId);
        }
        out.addProperty("active", active);
        out.addProperty("updatedAt", System.currentTimeMillis());
        boolean success = result != null && result.has("success") && result.get("success").getAsBoolean();
        out.addProperty("success", success);
        if (success) {
            JsonObject usage = result.getAsJsonObject("usage");
            out.add("rateLimits", usage.get("rate_limits"));
            out.add("rateLimitsAvailable", usage.get("rate_limits_available"));
            out.add("subscriptionType", usage.get("subscription_type"));
            out.add("behaviors", usage.get("behaviors"));
        } else {
            out.add("error", result != null ? result.get("error") : null);
            out.add("errorKind", result != null ? result.get("errorKind") : null);
        }
        callJavaScript("window.onClaudeAccountUsage", escapeJs(gson.toJson(out)));
    }

    // ==================== Login ====================

    private void startLogin(String method) {
        try {
            ClaudeLoginService.start(method, new ClaudeLoginService.Listener() {
                @Override
                public void onUrl(String url) {
                    JsonObject event = new JsonObject();
                    event.addProperty("type", "url");
                    event.addProperty("url", url);
                    pushLoginEvent(event);
                }

                @Override
                public void onFinished(boolean success, String error) {
                    JsonObject event = new JsonObject();
                    event.addProperty("type", "finished");
                    event.addProperty("success", success);
                    if (success) {
                        try {
                            ClaudeAccountStore.StoredAccount saved = ClaudeAccountManager.getInstance().saveCurrent();
                            event.addProperty("emailAddress", saved.emailAddress);
                            // The live login is now the new account.
                            ClaudeAccountCoordinator.afterAccountSwitched();
                        } catch (Exception e) {
                            event.addProperty("success", false);
                            event.addProperty("error", e.getMessage());
                        }
                    } else if (error != null) {
                        event.addProperty("error", error);
                    }
                    pushLoginEvent(event);
                }
            });
            JsonObject started = new JsonObject();
            started.addProperty("type", "started");
            pushLoginEvent(started);
        } catch (Exception e) {
            JsonObject event = new JsonObject();
            event.addProperty("type", "finished");
            event.addProperty("success", false);
            event.addProperty("error", e.getMessage());
            pushLoginEvent(event);
        }
    }

    private void pushLoginEvent(JsonObject event) {
        callJavaScript("window.onClaudeLoginEvent", escapeJs(gson.toJson(event)));
    }

    // ==================== Helpers ====================

    private void pushAccounts(JsonObject accounts) {
        callJavaScript("window.updateClaudeAccounts", escapeJs(gson.toJson(accounts)));
    }

    private void reportAction(String action, boolean success, String error, String email) {
        JsonObject out = new JsonObject();
        out.addProperty("action", action);
        out.addProperty("success", success);
        if (error != null) {
            out.addProperty("error", error);
        }
        if (email != null) {
            out.addProperty("emailAddress", email);
        }
        callJavaScript("window.onClaudeAccountAction", escapeJs(gson.toJson(out)));
    }

    private static JsonObject await(java.util.concurrent.CompletableFuture<JsonObject> future) {
        try {
            return future.get(90, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return failure("interrupted");
        } catch (Exception e) {
            return failure(e.getMessage());
        }
    }

    private static JsonObject failure(String message) {
        JsonObject out = new JsonObject();
        out.addProperty("success", false);
        out.addProperty("error", message);
        out.addProperty("errorKind", "unknown");
        return out;
    }

    private JsonObject parse(String content) {
        if (content == null || content.isBlank()) {
            return new JsonObject();
        }
        try {
            JsonObject parsed = gson.fromJson(content, JsonObject.class);
            return parsed != null ? parsed : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    private static String requireId(JsonObject payload) {
        if (!payload.has("id") || payload.get("id").isJsonNull()) {
            throw new IllegalArgumentException("Missing account id");
        }
        String id = payload.get("id").getAsString();
        if (!ClaudeAccountStore.isValidId(id)) {
            throw new IllegalArgumentException("Invalid account id");
        }
        return id;
    }

    private static boolean bool(JsonObject payload, String key, boolean fallback) {
        if (payload == null || !payload.has(key) || payload.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return payload.get(key).getAsBoolean();
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Unused accessor kept small: the outbound list is only ever built by the manager. */
    static JsonArray emptyArray() {
        return new JsonArray();
    }
}
