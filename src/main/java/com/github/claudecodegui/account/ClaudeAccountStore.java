package com.github.claudecodegui.account;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Persistence for saved Claude accounts.
 *
 * <pre>
 *   &lt;base&gt;/accounts.json        registry: which accounts exist, their order, cached usage
 *   &lt;base&gt;/accounts/&lt;id&gt;.json  per-account snapshot: credential blob + oauthAccount (0600)
 * </pre>
 *
 * Only file I/O lives here; swapping the live slot is {@link ClaudeLiveCredentials}, the
 * orchestration is {@link ClaudeAccountManager}.
 */
public class ClaudeAccountStore {

    private static final Logger LOG = Logger.getInstance(ClaudeAccountStore.class);

    /** Ids double as file names, so they are validated before every path join. */
    private static final Pattern ACCOUNT_ID = Pattern.compile("^acc-[a-f0-9-]{8,64}$");

    private final Path baseDir;

    public ClaudeAccountStore(Path baseDir) {
        this.baseDir = baseDir;
    }

    // ==================== Model ====================

    /** Metadata for one saved account. Field names mirror Claude's own data. */
    public static class StoredAccount {
        public String id;
        public String emailAddress;
        public String displayName;
        public String organizationName;
        /** {@code claudeAiOauth.subscriptionType}, e.g. "max", "pro", "team". */
        public String subscriptionType;
        /** {@code claudeAiOauth.rateLimitTier}, e.g. "default_claude_max_20x". */
        public String rateLimitTier;
        public long createdAt;
        public long updatedAt;
        /** {@code rate_limits} exactly as the CLI's get_usage returned it; null until first read. */
        public JsonObject usage;
        public long usageUpdatedAt;
        /** Whether this account takes part in automatic rotation on a usage limit. */
        public boolean rotationEnabled = true;
    }

    /** On-disk registry. */
    public static class Registry {
        public String current;
        public Map<String, StoredAccount> accounts = new LinkedHashMap<>();
        /** The order the user arranged accounts in; also the rotation order. */
        public List<String> order = new ArrayList<>();
        /** Switch to the next account automatically when a usage limit is reached. */
        public boolean autoRotate;
    }

    /** One account's stored credentials. */
    public static class Snapshot {
        public String credentials;
        public JsonObject oauthAccount;

        public Snapshot() {
        }

        public Snapshot(String credentials, JsonObject oauthAccount) {
            this.credentials = credentials;
            this.oauthAccount = oauthAccount;
        }
    }

    // ==================== Registry ====================

    /**
     * Read the registry for display. A missing or unreadable file reads as empty — the
     * account list has to render something.
     */
    public Registry readRegistry() {
        try {
            return readRegistryOrThrow();
        } catch (IOException e) {
            LOG.warn("[Accounts] Could not read " + registryPath() + " (" + e.getMessage() + "); showing no accounts");
            return new Registry();
        }
    }

    /**
     * Read the registry for a read-modify-write.
     *
     * <p>Throws instead of returning an empty registry when the file exists but is
     * unreadable: every writer saves the whole file, so treating "unreadable" as "empty"
     * would erase every other saved account on the next save.
     */
    public Registry readRegistryOrThrow() throws IOException {
        Path path = registryPath();
        if (!Files.exists(path)) {
            return new Registry();
        }
        JsonElement parsed;
        try {
            parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IOException("accounts.json is not valid JSON: " + e.getMessage(), e);
        }
        if (!parsed.isJsonObject()) {
            throw new IOException("accounts.json does not contain an object");
        }
        Registry registry = AccountFiles.GSON.fromJson(parsed, Registry.class);
        return normalize(registry);
    }

    public void writeRegistry(Registry registry) throws IOException {
        AccountFiles.writePrivateAtomically(registryPath(), AccountFiles.GSON.toJson(normalize(registry)));
    }

    // ==================== Snapshots ====================

    public Snapshot readSnapshot(String id) {
        Path path = snapshotPath(id);
        if (!Files.isRegularFile(path)) {
            return null;
        }
        try {
            Snapshot snapshot = AccountFiles.GSON.fromJson(Files.readString(path, StandardCharsets.UTF_8), Snapshot.class);
            return snapshot != null && snapshot.credentials != null ? snapshot : null;
        } catch (Exception e) {
            LOG.warn("[Accounts] Snapshot for " + id + " is unreadable: " + e.getMessage());
            return null;
        }
    }

    public void writeSnapshot(String id, Snapshot snapshot) throws IOException {
        AccountFiles.writePrivateAtomically(snapshotPath(id), AccountFiles.GSON.toJson(snapshot));
    }

    public void deleteSnapshot(String id) throws IOException {
        Files.deleteIfExists(snapshotPath(id));
    }

    public Path snapshotPath(String id) {
        if (!isValidId(id)) {
            throw new IllegalArgumentException("Invalid account id");
        }
        return baseDir.resolve("accounts").resolve(id + ".json");
    }

    /** Scratch directory for querying one saved account in isolation. */
    public Path sandboxDir(String id) {
        if (!isValidId(id)) {
            throw new IllegalArgumentException("Invalid account id");
        }
        return baseDir.resolve("accounts").resolve("sandbox").resolve(id);
    }

    public static boolean isValidId(String id) {
        return id != null && ACCOUNT_ID.matcher(id).matches();
    }

    public static String newAccountId() {
        return "acc-" + UUID.randomUUID();
    }

    private Path registryPath() {
        return baseDir.resolve("accounts.json");
    }

    /** Drop entries with bad ids, and keep {@code order} a duplicate-free list of known ids. */
    static Registry normalize(Registry registry) {
        Registry out = registry != null ? registry : new Registry();
        Map<String, StoredAccount> accounts = new LinkedHashMap<>();
        if (out.accounts != null) {
            for (Map.Entry<String, StoredAccount> entry : out.accounts.entrySet()) {
                StoredAccount account = entry.getValue();
                if (account != null && isValidId(entry.getKey()) && entry.getKey().equals(account.id)) {
                    accounts.put(entry.getKey(), account);
                }
            }
        }
        out.accounts = accounts;

        Set<String> order = new LinkedHashSet<>();
        if (out.order != null) {
            for (String id : out.order) {
                if (id != null && accounts.containsKey(id)) {
                    order.add(id);
                }
            }
        }
        // Accounts never arranged by the user follow in registration order.
        accounts.values().stream()
                .sorted((a, b) -> Long.compare(a.createdAt, b.createdAt))
                .forEach(a -> order.add(a.id));
        out.order = new ArrayList<>(order);

        if (out.current != null && !accounts.containsKey(out.current)) {
            out.current = null;
        }
        return out;
    }
}
