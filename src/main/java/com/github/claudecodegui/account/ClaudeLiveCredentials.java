package com.github.claudecodegui.account;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * The live Claude Code credential slot — the one login the CLI reads when it starts.
 *
 * <p>Switching accounts means swapping what lives here, because the CLI has exactly one
 * active credential:
 * <ul>
 *   <li>macOS: Keychain generic password, service {@code "Claude Code-credentials"}
 *       (suffixed with {@code -<sha256(configDir)[0:8]>} when {@code CLAUDE_CONFIG_DIR} is set),
 *       account {@code $USER}.</li>
 *   <li>Linux / Windows: {@code <configDir>/.credentials.json}.</li>
 * </ul>
 * Account metadata (email, display name, organization) lives separately as the
 * {@code oauthAccount} object in the global config file {@code .claude.json}.
 *
 * <p>SECURITY: the credential blob carries live OAuth tokens. It is never logged.
 */
public class ClaudeLiveCredentials {

    private static final Logger LOG = Logger.getInstance(ClaudeLiveCredentials.class);
    private static final String KEYCHAIN_SERVICE = "Claude Code-credentials";
    private static final String SECURITY_BINARY = "/usr/bin/security";
    private static final long KEYCHAIN_TIMEOUT_SECONDS = 10L;

    private final Path configDir;
    private final Path globalConfigFile;
    private final boolean useKeychain;
    private final String keychainService;
    private final String keychainAccount;

    public ClaudeLiveCredentials(
            Path configDir,
            Path globalConfigFile,
            boolean useKeychain,
            String keychainService,
            String keychainAccount
    ) {
        this.configDir = configDir;
        this.globalConfigFile = globalConfigFile;
        this.useKeychain = useKeychain;
        this.keychainService = keychainService;
        this.keychainAccount = keychainAccount;
    }

    /**
     * Resolve the slot the CLI started by this plugin will read.
     *
     * <p>The home directory follows the Node runtime (a WSL Node keeps its login in the
     * WSL home), and {@code CLAUDE_CONFIG_DIR} is honoured only for a native runtime: a
     * WSL distro has its own environment, which the IDE cannot see.
     */
    public static ClaudeLiveCredentials forCurrentEnvironment() {
        String home = NodeDetector.resolveHomeForFileOps();
        String nodePath = NodeDetector.getInstance().getCachedNodePath();
        boolean wsl = nodePath != null && NodeDetector.isWslPath(nodePath);
        String customConfigDir = wsl ? null : trimToNull(System.getenv("CLAUDE_CONFIG_DIR"));

        Path configDir = customConfigDir != null ? Paths.get(customConfigDir) : Paths.get(home, ".claude");
        Path globalConfig = customConfigDir != null
                ? Paths.get(customConfigDir, ".claude.json")
                : Paths.get(home, ".claude.json");

        boolean keychain = PlatformUtils.isMac() && !wsl;
        String service = customConfigDir != null
                ? KEYCHAIN_SERVICE + "-" + sha256Prefix(configDir.toString())
                : KEYCHAIN_SERVICE;
        return new ClaudeLiveCredentials(configDir, globalConfig, keychain, service, resolveKeychainAccount());
    }

    public Path getConfigDir() {
        return configDir;
    }

    public boolean usesKeychain() {
        return useKeychain;
    }

    // ==================== Credentials ====================

    /** Read the live credential blob, or {@code ""} when nothing is stored. */
    public String readCredentials() throws IOException {
        if (useKeychain) {
            KeychainResult result = runSecurity(List.of(
                    "find-generic-password", "-a", keychainAccount, "-s", keychainService, "-w"));
            return result.exitCode == 0 ? result.stdout.trim() : "";
        }
        Path file = credentialsFile();
        if (!Files.isRegularFile(file)) {
            return "";
        }
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    /** Replace the live credential blob. */
    public void writeCredentials(String blob) throws IOException {
        validateCredentialBlob(blob);
        if (useKeychain) {
            // -U updates in place. The secret must be passed with -w: without a value
            // `security` prompts on a TTY and a headless process stores an empty secret.
            KeychainResult result = runSecurity(List.of(
                    "add-generic-password", "-U", "-s", keychainService, "-a", keychainAccount, "-w", blob));
            if (result.exitCode != 0) {
                throw new IOException("Keychain update failed (exit " + result.exitCode + ")");
            }
            return;
        }
        AccountFiles.writePrivateAtomically(credentialsFile(), blob);
    }

    // ==================== oauthAccount metadata ====================

    /** Read the live {@code oauthAccount} object, or null when absent or unreadable. */
    public JsonObject readOauthAccount() {
        try {
            JsonObject root = readGlobalConfig();
            if (root == null) {
                return null;
            }
            JsonElement account = root.get("oauthAccount");
            return account != null && account.isJsonObject() ? account.getAsJsonObject().deepCopy() : null;
        } catch (IOException e) {
            LOG.debug("[Accounts] Could not read " + globalConfigFile + ": " + e.getMessage());
            return null;
        }
    }

    /**
     * Replace the live {@code oauthAccount} object, preserving every other key.
     *
     * <p>Refuses to write when the file exists but cannot be parsed: rewriting it from an
     * empty object would wipe the user's MCP servers, project trust and history.
     */
    public void writeOauthAccount(JsonObject oauthAccount) throws IOException {
        JsonObject root = Files.exists(globalConfigFile) ? readGlobalConfig() : new JsonObject();
        if (root == null) {
            throw new IOException(globalConfigFile + " is not valid JSON; refusing to overwrite it");
        }
        root.add("oauthAccount", oauthAccount);
        AccountFiles.writePrivateAtomically(globalConfigFile, AccountFiles.GSON.toJson(root));
    }

    // ==================== Helpers ====================

    /**
     * Throw unless {@code blob} is a well-formed Claude OAuth payload. Never includes the
     * blob in the message.
     */
    public static void validateCredentialBlob(String blob) {
        if (blob == null || blob.isBlank()) {
            throw new IllegalArgumentException("Claude credentials are empty");
        }
        JsonElement parsed;
        try {
            parsed = JsonParser.parseString(blob);
        } catch (Exception e) {
            throw new IllegalArgumentException("Claude OAuth credential payload is invalid JSON");
        }
        if (!parsed.isJsonObject()
                || !parsed.getAsJsonObject().has("claudeAiOauth")
                || !parsed.getAsJsonObject().get("claudeAiOauth").isJsonObject()) {
            throw new IllegalArgumentException("Claude credentials are not a claude.ai login (missing claudeAiOauth)");
        }
    }

    /** {@code claudeAiOauth} from a credential blob, or null when the blob is not one. */
    public static JsonObject oauthSection(String blob) {
        try {
            JsonElement parsed = JsonParser.parseString(blob);
            if (parsed.isJsonObject() && parsed.getAsJsonObject().has("claudeAiOauth")
                    && parsed.getAsJsonObject().get("claudeAiOauth").isJsonObject()) {
                return parsed.getAsJsonObject().getAsJsonObject("claudeAiOauth");
            }
        } catch (Exception ignored) {
            // not a credential blob
        }
        return null;
    }

    private Path credentialsFile() {
        return configDir.resolve(".credentials.json");
    }

    /** Null when the file exists but is not a JSON object; an empty object when absent. */
    private JsonObject readGlobalConfig() throws IOException {
        if (!Files.isRegularFile(globalConfigFile)) {
            return new JsonObject();
        }
        String raw = Files.readString(globalConfigFile, StandardCharsets.UTF_8);
        try {
            JsonElement parsed = JsonParser.parseString(raw);
            return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static KeychainResult runSecurity(List<String> args) throws IOException {
        List<String> command = new ArrayList<>();
        command.add(SECURITY_BINARY);
        command.addAll(args);
        Process process = new ProcessBuilder(command).redirectErrorStream(false).start();
        try {
            byte[] out = process.getInputStream().readAllBytes();
            if (!process.waitFor(KEYCHAIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IOException("Keychain command timed out");
            }
            return new KeychainResult(process.exitValue(), new String(out, StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            throw new IOException("Keychain command interrupted", e);
        }
    }

    private static String resolveKeychainAccount() {
        String user = trimToNull(System.getenv("USER"));
        if (user != null) {
            return user;
        }
        user = trimToNull(System.getProperty("user.name"));
        return user != null ? user : "claude-code-user";
    }

    static String sha256Prefix(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 4; i++) {
                hex.append(String.format("%02x", hash[i]));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final class KeychainResult {
        final int exitCode;
        final String stdout;

        KeychainResult(int exitCode, String stdout) {
            this.exitCode = exitCode;
            this.stdout = stdout;
        }
    }
}
