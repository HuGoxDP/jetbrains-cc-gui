package com.github.claudecodegui.account;

import com.github.claudecodegui.account.ClaudeAccountStore.Registry;
import com.github.claudecodegui.account.ClaudeAccountStore.Snapshot;
import com.github.claudecodegui.account.ClaudeAccountStore.StoredAccount;
import com.github.claudecodegui.bridge.NodeDetector;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

/**
 * Multi-account operations for Claude subscription logins: list, save the current login,
 * switch, delete, arrange, and pick the next account when a usage limit is reached.
 *
 * <p>The CLI has exactly one live credential, so every operation that touches it runs
 * under one process-wide lock. Before the live slot is overwritten, the outgoing login is
 * re-captured: the CLI rotates refresh tokens, so a snapshot taken days ago may no longer
 * be able to sign in, while the live copy can.
 */
public class ClaudeAccountManager {

    private static final Logger LOG = Logger.getInstance(ClaudeAccountManager.class);
    private static final Object LOCK = new Object();

    private static volatile ClaudeAccountManager instance;

    private final ClaudeAccountStore store;
    private final Supplier<ClaudeLiveCredentials> liveSupplier;

    public ClaudeAccountManager(ClaudeAccountStore store, Supplier<ClaudeLiveCredentials> liveSupplier) {
        this.store = store;
        this.liveSupplier = liveSupplier;
    }

    public static ClaudeAccountManager getInstance() {
        ClaudeAccountManager current = instance;
        if (current == null) {
            synchronized (ClaudeAccountManager.class) {
                current = instance;
                if (current == null) {
                    Path base = Paths.get(NodeDetector.resolveHomeForFileOps(), ".codemoss");
                    current = new ClaudeAccountManager(new ClaudeAccountStore(base), ClaudeLiveCredentials::forCurrentEnvironment);
                    instance = current;
                }
            }
        }
        return current;
    }

    public ClaudeAccountStore getStore() {
        return store;
    }

    // ==================== Live login ====================

    /** Identity of the login currently in the live slot. */
    public static final class LiveLogin {
        public final boolean loggedIn;
        public final String emailAddress;

        LiveLogin(boolean loggedIn, String emailAddress) {
            this.loggedIn = loggedIn;
            this.emailAddress = emailAddress;
        }
    }

    public LiveLogin readLiveLogin() {
        ClaudeLiveCredentials live = liveSupplier.get();
        boolean loggedIn;
        try {
            String blob = live.readCredentials();
            loggedIn = ClaudeLiveCredentials.oauthSection(blob) != null;
        } catch (IOException e) {
            loggedIn = false;
        }
        JsonObject oauth = live.readOauthAccount();
        return new LiveLogin(loggedIn, str(oauth, "emailAddress"));
    }

    /** Id of the saved account the live login belongs to, or null. */
    public String activeAccountId() {
        LiveLogin login = readLiveLogin();
        if (!login.loggedIn || login.emailAddress == null) {
            return null;
        }
        StoredAccount match = findByEmail(store.readRegistry(), login.emailAddress);
        return match != null ? match.id : null;
    }

    // ==================== List ====================

    /**
     * Build the account list for the webview. Never contains credentials.
     *
     * @param autoCapture save the live login when it is not in the list yet, and refresh the
     *                    snapshot of the one that is (its tokens may have been rotated)
     */
    public JsonObject list(boolean autoCapture) {
        if (autoCapture) {
            try {
                captureLiveLogin();
            } catch (Exception e) {
                LOG.debug("[Accounts] Auto-capture skipped: " + e.getMessage());
            }
        }

        Registry registry = store.readRegistry();
        LiveLogin login = readLiveLogin();
        String activeEmail = login.loggedIn ? login.emailAddress : null;

        JsonArray accounts = new JsonArray();
        boolean liveSaved = false;
        for (String id : registry.order) {
            StoredAccount account = registry.accounts.get(id);
            if (account == null) {
                continue;
            }
            boolean active = activeEmail != null && activeEmail.equalsIgnoreCase(account.emailAddress);
            liveSaved |= active;
            JsonObject item = AccountFiles.GSON.toJsonTree(account).getAsJsonObject();
            item.addProperty("active", active);
            item.addProperty("hasSnapshot", Files.isRegularFile(store.snapshotPath(id)));
            accounts.add(item);
        }

        JsonObject result = new JsonObject();
        result.add("accounts", accounts);
        result.addProperty("activeEmail", activeEmail);
        result.addProperty("liveLoggedIn", login.loggedIn);
        result.addProperty("liveSaved", liveSaved);
        result.addProperty("autoRotate", registry.autoRotate);
        result.addProperty("isolatedUsageSupported", isIsolatedUsageSupported());
        return result;
    }

    /**
     * Saved accounts can be queried in isolation only where credentials are a plain file.
     * On macOS they live in the Keychain under a name derived from the config directory,
     * so a sandboxed CLI would find nothing.
     */
    public boolean isIsolatedUsageSupported() {
        return !liveSupplier.get().usesKeychain();
    }

    // ==================== Save current ====================

    /**
     * Capture the live login into the registry. An account with the same email is refreshed
     * in place (same id, same position).
     */
    public StoredAccount saveCurrent() throws IOException {
        synchronized (LOCK) {
            StoredAccount saved = captureLiveLogin();
            if (saved == null) {
                throw new IOException("No Claude login found. Sign in with \"Add account\" or run `claude auth login`.");
            }
            return saved;
        }
    }

    /** Returns null when there is no claude.ai login to capture. */
    private StoredAccount captureLiveLogin() throws IOException {
        synchronized (LOCK) {
            ClaudeLiveCredentials live = liveSupplier.get();
            String blob = live.readCredentials();
            JsonObject oauthSection = ClaudeLiveCredentials.oauthSection(blob);
            if (oauthSection == null) {
                return null;
            }
            JsonObject oauthAccount = live.readOauthAccount();
            String email = str(oauthAccount, "emailAddress");
            if (email == null) {
                throw new IOException("Could not determine the account email from ~/.claude.json");
            }

            Registry registry = store.readRegistryOrThrow();
            StoredAccount existing = findByEmail(registry, email);
            if (existing != null) {
                Snapshot snapshot = store.readSnapshot(existing.id);
                boolean unchanged = snapshot != null && blob.equals(snapshot.credentials);
                if (unchanged && registry.accounts.get(existing.id).subscriptionType != null) {
                    return existing;
                }
            }

            long now = System.currentTimeMillis();
            StoredAccount account = existing != null ? existing : new StoredAccount();
            if (existing == null) {
                account.id = ClaudeAccountStore.newAccountId();
                account.createdAt = now;
            }
            account.emailAddress = email;
            account.displayName = str(oauthAccount, "displayName");
            account.organizationName = str(oauthAccount, "organizationName");
            account.subscriptionType = str(oauthSection, "subscriptionType");
            account.rateLimitTier = str(oauthSection, "rateLimitTier");
            account.updatedAt = now;

            store.writeSnapshot(account.id, new Snapshot(blob, oauthAccount));
            registry.accounts.put(account.id, account);
            registry.current = account.id;
            store.writeRegistry(registry);
            return account;
        }
    }

    // ==================== Switch ====================

    /**
     * Make a saved account the live login. The outgoing login is captured first (saved if
     * it is new, refreshed if not), and the live slot is rolled back if the swap fails.
     */
    public StoredAccount switchTo(String id) throws IOException {
        synchronized (LOCK) {
            Registry registry = store.readRegistryOrThrow();
            StoredAccount target = registry.accounts.get(id);
            if (target == null) {
                throw new IOException("Unknown account");
            }
            Snapshot snapshot = store.readSnapshot(id);
            if (snapshot == null) {
                throw new IOException("The saved credentials for " + target.emailAddress + " are missing. Sign in again.");
            }
            ClaudeLiveCredentials.validateCredentialBlob(snapshot.credentials);

            ClaudeLiveCredentials live = liveSupplier.get();
            String previousBlob = live.readCredentials();
            JsonObject previousOauth = live.readOauthAccount();

            String liveEmail = str(previousOauth, "emailAddress");
            if (liveEmail != null && liveEmail.equalsIgnoreCase(target.emailAddress)) {
                // Already live: only make sure the registry agrees.
                captureLiveLogin();
                return store.readRegistry().accounts.getOrDefault(id, target);
            }

            // Never lose the outgoing login: save it if new, refresh its tokens if known.
            try {
                captureLiveLogin();
            } catch (Exception e) {
                LOG.warn("[Accounts] Could not capture the outgoing login before switching: " + e.getMessage());
            }

            try {
                live.writeCredentials(snapshot.credentials);
                if (snapshot.oauthAccount != null) {
                    live.writeOauthAccount(snapshot.oauthAccount);
                }
            } catch (Exception e) {
                rollback(live, previousBlob, previousOauth);
                throw new IOException("Failed to switch account: " + e.getMessage(), e);
            }

            Registry updated = store.readRegistryOrThrow();
            updated.current = id;
            StoredAccount stored = updated.accounts.getOrDefault(id, target);
            stored.updatedAt = System.currentTimeMillis();
            store.writeRegistry(updated);
            LOG.info("[Accounts] Switched live Claude login to account " + id);
            return stored;
        }
    }

    private static void rollback(ClaudeLiveCredentials live, String previousBlob, JsonObject previousOauth) {
        try {
            if (previousBlob != null && !previousBlob.isBlank()) {
                live.writeCredentials(previousBlob);
            }
            if (previousOauth != null) {
                live.writeOauthAccount(previousOauth);
            }
        } catch (Exception e) {
            LOG.warn("[Accounts] Rollback after a failed switch also failed: " + e.getMessage());
        }
    }

    // ==================== Delete / arrange ====================

    /** Forget a saved account. The live login is left alone even if it is this account. */
    public void delete(String id) throws IOException {
        synchronized (LOCK) {
            Registry registry = store.readRegistryOrThrow();
            if (registry.accounts.remove(id) != null) {
                registry.order.remove(id);
                if (id.equals(registry.current)) {
                    registry.current = null;
                }
                store.writeRegistry(registry);
            }
            store.deleteSnapshot(id);
            AccountFiles.deleteTree(store.sandboxDir(id));
        }
    }

    public void reorder(List<String> ids) throws IOException {
        synchronized (LOCK) {
            Registry registry = store.readRegistryOrThrow();
            registry.order = new ArrayList<>(ids);
            store.writeRegistry(registry);
        }
    }

    public void setRotationEnabled(String id, boolean enabled) throws IOException {
        synchronized (LOCK) {
            Registry registry = store.readRegistryOrThrow();
            StoredAccount account = registry.accounts.get(id);
            if (account == null) {
                throw new IOException("Unknown account");
            }
            account.rotationEnabled = enabled;
            store.writeRegistry(registry);
        }
    }

    public void setAutoRotate(boolean enabled) throws IOException {
        synchronized (LOCK) {
            Registry registry = store.readRegistryOrThrow();
            registry.autoRotate = enabled;
            store.writeRegistry(registry);
        }
    }

    public boolean isAutoRotateEnabled() {
        return store.readRegistry().autoRotate;
    }

    // ==================== Usage cache ====================

    /**
     * Remember the plan usage read for an account. {@code rateLimits} is stored exactly as
     * the CLI returned it. Null readings are ignored: "could not read" is not "unused".
     */
    public void recordUsage(String accountId, JsonObject rateLimits) {
        if (accountId == null || rateLimits == null) {
            return;
        }
        synchronized (LOCK) {
            try {
                Registry registry = store.readRegistryOrThrow();
                StoredAccount account = registry.accounts.get(accountId);
                if (account == null) {
                    return;
                }
                account.usage = rateLimits.deepCopy();
                account.usageUpdatedAt = System.currentTimeMillis();
                store.writeRegistry(registry);
            } catch (IOException e) {
                LOG.debug("[Accounts] Could not cache usage: " + e.getMessage());
            }
        }
    }

    // ==================== Isolated usage queries ====================

    /**
     * Lay out a throwaway Claude config directory holding one saved account's login, so
     * the CLI can be asked about that account without touching the live slot.
     */
    public Path prepareUsageSandbox(String id) throws IOException {
        if (!isIsolatedUsageSupported()) {
            throw new IOException("Saved accounts cannot be queried in isolation on this platform");
        }
        synchronized (LOCK) {
            Snapshot snapshot = store.readSnapshot(id);
            if (snapshot == null) {
                throw new IOException("Saved credentials are missing");
            }
            Path dir = store.sandboxDir(id);
            AccountFiles.deleteTree(dir);
            Files.createDirectories(dir);
            AccountFiles.writePrivateAtomically(dir.resolve(".credentials.json"), snapshot.credentials);
            JsonObject globalConfig = new JsonObject();
            if (snapshot.oauthAccount != null) {
                globalConfig.add("oauthAccount", snapshot.oauthAccount);
            }
            globalConfig.addProperty("hasCompletedOnboarding", true);
            AccountFiles.writePrivateAtomically(dir.resolve(".claude.json"), AccountFiles.GSON.toJson(globalConfig));
            return dir;
        }
    }

    /**
     * Copy back tokens the CLI refreshed inside the sandbox, then delete it. Refresh tokens
     * rotate, so dropping a refreshed blob would leave the snapshot unable to sign in.
     */
    public void finishUsageSandbox(String id, Path dir) {
        synchronized (LOCK) {
            try {
                Path file = dir.resolve(".credentials.json");
                if (Files.isRegularFile(file)) {
                    String refreshed = Files.readString(file, StandardCharsets.UTF_8);
                    Snapshot snapshot = store.readSnapshot(id);
                    if (snapshot != null && ClaudeLiveCredentials.oauthSection(refreshed) != null
                            && !refreshed.equals(snapshot.credentials)) {
                        snapshot.credentials = refreshed;
                        store.writeSnapshot(id, snapshot);
                        LOG.info("[Accounts] Kept refreshed tokens for account " + id);
                    }
                }
            } catch (Exception e) {
                LOG.warn("[Accounts] Could not copy back refreshed tokens for " + id + ": " + e.getMessage());
            } finally {
                AccountFiles.deleteTree(dir);
            }
        }
    }

    // ==================== Rotation ====================

    /** The account rotation should move to, and why. */
    public static final class RotationChoice {
        public final String accountId;
        /** True when cached usage says the account has room; false when merely not known to be out. */
        public final boolean confirmedAvailable;

        RotationChoice(String accountId, boolean confirmedAvailable) {
            this.accountId = accountId;
            this.confirmedAvailable = confirmedAvailable;
        }
    }

    /**
     * Pick the next account after {@code fromId} in rotation order.
     *
     * <p>Order of preference: the first account whose cached usage shows room, then the
     * first account not known to be exhausted. An account is only skipped on proof of
     * exhaustion (a window at 100% that has not reset yet); a missing or stale reading
     * keeps it in the running, because the current account is already known to be out.
     * Returns null when no other account qualifies.
     */
    public static RotationChoice selectRotationTarget(Registry registry, String fromId, String model, long nowMillis) {
        List<String> candidates = new ArrayList<>();
        for (String id : registry.order) {
            StoredAccount account = registry.accounts.get(id);
            if (account != null && account.rotationEnabled) {
                candidates.add(id);
            }
        }
        int start = fromId != null ? candidates.indexOf(fromId) : -1;
        List<String> rotation = new ArrayList<>();
        for (int i = 1; i <= candidates.size(); i++) {
            String id = candidates.get(Math.floorMod(start + i, candidates.size()));
            if (!id.equals(fromId)) {
                rotation.add(id);
            }
        }

        String unknown = null;
        for (String id : rotation) {
            UsageState state = usageState(registry.accounts.get(id).usage, model, nowMillis);
            if (state == UsageState.AVAILABLE) {
                return new RotationChoice(id, true);
            }
            if (state == UsageState.UNKNOWN && unknown == null) {
                unknown = id;
            }
        }
        return unknown != null ? new RotationChoice(unknown, false) : null;
    }

    public RotationChoice selectRotationTarget(String fromId, String model) {
        return selectRotationTarget(store.readRegistry(), fromId, model, System.currentTimeMillis());
    }

    enum UsageState { AVAILABLE, EXHAUSTED, UNKNOWN }

    /**
     * Classify a cached {@code rate_limits} reading. A window counts as exhausted only while
     * it is at 100% and its reset time is still ahead; once the reset passes, the reading
     * says nothing about the new window.
     */
    static UsageState usageState(JsonObject rateLimits, String model, long nowMillis) {
        if (rateLimits == null) {
            return UsageState.UNKNOWN;
        }
        List<JsonObject> windows = new ArrayList<>();
        addWindow(windows, rateLimits, "five_hour");
        addWindow(windows, rateLimits, "seven_day");
        String family = model != null ? model.toLowerCase(Locale.ROOT) : "";
        if (family.isEmpty() || family.contains("opus")) {
            addWindow(windows, rateLimits, "seven_day_opus");
        }
        if (family.isEmpty() || family.contains("sonnet")) {
            addWindow(windows, rateLimits, "seven_day_sonnet");
        }
        if (windows.isEmpty()) {
            return UsageState.UNKNOWN;
        }
        boolean anyCurrent = false;
        for (JsonObject window : windows) {
            Double utilization = num(window, "utilization");
            Long resetsAt = parseIsoMillis(str(window, "resets_at"));
            boolean stillCurrent = resetsAt == null || resetsAt > nowMillis;
            if (utilization == null || !stillCurrent) {
                continue;
            }
            anyCurrent = true;
            if (utilization >= 100.0 && resetsAt != null) {
                return UsageState.EXHAUSTED;
            }
        }
        return anyCurrent ? UsageState.AVAILABLE : UsageState.UNKNOWN;
    }

    private static void addWindow(List<JsonObject> out, JsonObject rateLimits, String key) {
        JsonElement element = rateLimits.get(key);
        if (element != null && element.isJsonObject()) {
            out.add(element.getAsJsonObject());
        }
    }

    // ==================== Helpers ====================

    private static StoredAccount findByEmail(Registry registry, String email) {
        if (email == null) {
            return null;
        }
        for (StoredAccount account : registry.accounts.values()) {
            if (email.equalsIgnoreCase(account.emailAddress)) {
                return account;
            }
        }
        return null;
    }

    static String str(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull() || !obj.get(key).isJsonPrimitive()) {
            return null;
        }
        String value = obj.get(key).getAsString().trim();
        return value.isEmpty() ? null : value;
    }

    private static Double num(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || !obj.get(key).isJsonPrimitive()
                || !obj.get(key).getAsJsonPrimitive().isNumber()) {
            return null;
        }
        double value = obj.get(key).getAsDouble();
        return Double.isFinite(value) ? value : null;
    }

    private static Long parseIsoMillis(String iso) {
        if (iso == null) {
            return null;
        }
        try {
            return java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli();
        } catch (Exception e) {
            try {
                return java.time.Instant.parse(iso).toEpochMilli();
            } catch (Exception ignored) {
                return null;
            }
        }
    }
}
