package com.github.claudecodegui.account;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.util.PlatformUtils;
import com.intellij.ide.util.PropertiesComponent;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Runs {@code claude auth login} so a new account can be added without a terminal.
 *
 * <p>The CLI opens the browser itself where it can and always prints the OAuth URL; the URL
 * is forwarded to the webview so the user can open it when the automatic open fails (WSL,
 * remote desktops). When the browser's callback cannot reach the CLI, the page shows a code
 * that is pasted back and written to the process's stdin.
 *
 * <p>Only one login runs at a time: there is one live credential slot to write into.
 */
public final class ClaudeLoginService {

    private static final Logger LOG = Logger.getInstance(ClaudeLoginService.class);

    /** Same key as {@code ClaudeCliPathHandler.CLAUDE_CLI_PATH_PROPERTY_KEY}. */
    private static final String CLI_PATH_PROPERTY_KEY = "claude.code.cli.path";

    private static final Pattern ANSI = Pattern.compile("\\u001B\\[[0-9;?]*[ -/]*[@-~]");
    private static final Pattern OAUTH_URL = Pattern.compile("https://\\S*/oauth/authorize\\S*");
    private static final Pattern TRAILING_PUNCTUATION = Pattern.compile("[)\\]}>.,;:!?'\"`]+$");

    /** Credentials the CLI would prefer over a fresh login; a login must never inherit them. */
    private static final String[] AUTH_ENV_TO_STRIP = {
            "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
            "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
            "CLAUDE_CODE_USE_FOUNDRY", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT",
    };

    private static final AtomicReference<Process> ACTIVE = new AtomicReference<>();

    /** Login progress, delivered on a pooled thread. */
    public interface Listener {
        void onUrl(String url);

        void onFinished(boolean success, String error);
    }

    private ClaudeLoginService() {
    }

    public static boolean isRunning() {
        Process process = ACTIVE.get();
        return process != null && process.isAlive();
    }

    /**
     * Start a login. {@code method} is {@code "console"} for an Anthropic Console account;
     * anything else runs the claude.ai subscription flow.
     */
    public static void start(String method, Listener listener) throws IOException {
        String nodePath = NodeDetector.getInstance().getCachedNodePath();
        if (nodePath != null && NodeDetector.isWslPath(nodePath)) {
            throw new IOException("Claude runs inside WSL here. Run `claude auth login` in a WSL terminal, "
                    + "then use \"Save current login\".");
        }
        String binary = resolveClaudeBinary();
        if (binary == null) {
            throw new IOException("Claude Code CLI not found. Install the Claude Code SDK in Settings > Dependencies, "
                    + "or set the CLI path in Settings > Basic.");
        }

        Process previous = ACTIVE.getAndSet(null);
        if (previous != null && previous.isAlive()) {
            previous.destroyForcibly();
        }

        List<String> command = new ArrayList<>();
        if (binary.toLowerCase(java.util.Locale.ROOT).endsWith(".cmd")) {
            // npm shims are batch files: CreateProcess cannot start them directly.
            command.add("cmd");
            command.add("/c");
        }
        command.add(binary);
        command.add("auth");
        command.add("login");
        command.add("console".equals(method) ? "--console" : "--claudeai");
        String flag = command.get(command.size() - 1);

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.redirectErrorStream(true);
        Map<String, String> env = builder.environment();
        for (String key : AUTH_ENV_TO_STRIP) {
            env.remove(key);
        }
        builder.directory(new File(PlatformUtils.getHomeDirectory()));

        Process process = builder.start();
        ACTIVE.set(process);
        LOG.info("[Accounts] Started claude auth login (" + flag + ")");

        AppExecutorUtil.getAppExecutorService().execute(() -> pump(process, listener));
    }

    /** Feed the code the browser showed to the waiting login. */
    public static boolean submitCode(String code) {
        Process process = ACTIVE.get();
        if (process == null || !process.isAlive() || code == null || code.isBlank()) {
            return false;
        }
        try {
            OutputStream stdin = process.getOutputStream();
            stdin.write((code.trim() + "\n").getBytes(StandardCharsets.UTF_8));
            stdin.flush();
            return true;
        } catch (IOException e) {
            LOG.warn("[Accounts] Could not pass the login code: " + e.getMessage());
            return false;
        }
    }

    public static void cancel() {
        Process process = ACTIVE.getAndSet(null);
        if (process != null && process.isAlive()) {
            PlatformUtils.terminateProcess(process);
        }
    }

    private static void pump(Process process, Listener listener) {
        StringBuilder buffer = new StringBuilder();
        boolean urlSent = false;
        try (InputStream in = process.getInputStream()) {
            byte[] chunk = new byte[4096];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.append(new String(chunk, 0, read, StandardCharsets.UTF_8));
                if (!urlSent) {
                    String url = extractOAuthUrl(buffer.toString());
                    if (url != null) {
                        urlSent = true;
                        listener.onUrl(url);
                    }
                }
                if (buffer.length() > 64_000) {
                    buffer.delete(0, buffer.length() - 16_000);
                }
            }
            int exit = process.waitFor();
            boolean cancelled = ACTIVE.get() != process;
            ACTIVE.compareAndSet(process, null);
            if (cancelled) {
                listener.onFinished(false, "cancelled");
            } else if (exit == 0) {
                listener.onFinished(true, null);
            } else {
                listener.onFinished(false, lastMeaningfulLine(buffer.toString(), "Login failed or was cancelled (exit " + exit + ")"));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            listener.onFinished(false, "Login interrupted");
        } catch (IOException e) {
            ACTIVE.compareAndSet(process, null);
            listener.onFinished(false, e.getMessage());
        }
    }

    /** OAuth authorize URL in CLI output, tolerating the ANSI codes of its terminal UI. */
    static String extractOAuthUrl(String text) {
        String clean = ANSI.matcher(text).replaceAll("");
        Matcher matcher = OAUTH_URL.matcher(clean);
        if (!matcher.find()) {
            return null;
        }
        return TRAILING_PUNCTUATION.matcher(matcher.group()).replaceAll("");
    }

    static String lastMeaningfulLine(String output, String fallback) {
        String[] lines = ANSI.matcher(output).replaceAll("").split("\\R");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (!line.isEmpty() && !line.startsWith("Paste code")) {
                return line.length() > 300 ? line.substring(0, 300) : line;
            }
        }
        return fallback;
    }

    /**
     * Find a Claude Code CLI: the user's configured path, then the native binary shipped
     * with the installed Agent SDK, then {@code claude} on PATH.
     */
    static String resolveClaudeBinary() {
        try {
            String configured = PropertiesComponent.getInstance().getValue(CLI_PATH_PROPERTY_KEY);
            if (configured != null && !configured.isBlank() && new File(configured.trim()).canExecute()) {
                return configured.trim();
            }
        } catch (Exception ignored) {
            // PropertiesComponent unavailable (tests)
        }

        String exe = PlatformUtils.isWindows() ? "claude.exe" : "claude";
        Path anthropicDir = Paths.get(PlatformUtils.getHomeDirectory(), ".codemoss", "dependencies",
                "claude-sdk", "node_modules", "@anthropic-ai");
        if (Files.isDirectory(anthropicDir)) {
            try (Stream<Path> children = Files.list(anthropicDir)) {
                String bundled = children
                        .filter(p -> p.getFileName().toString().startsWith("claude-agent-sdk-"))
                        .map(p -> p.resolve(exe))
                        .filter(Files::isRegularFile)
                        .map(Path::toString)
                        .findFirst()
                        .orElse(null);
                if (bundled != null) {
                    return bundled;
                }
            } catch (IOException ignored) {
                // fall through to PATH
            }
        }

        List<String> names = PlatformUtils.isWindows()
                ? List.of("claude.exe", "claude.cmd")
                : List.of("claude");
        List<String> dirs = new ArrayList<>();
        String path = PlatformUtils.getPathEnv();
        if (path != null) {
            dirs.addAll(List.of(path.split(File.pathSeparator)));
        }
        dirs.add(Paths.get(PlatformUtils.getHomeDirectory(), ".local", "bin").toString());
        dirs.add(Paths.get(PlatformUtils.getHomeDirectory(), ".claude", "local").toString());
        for (String dir : dirs) {
            if (dir == null || dir.isBlank()) {
                continue;
            }
            for (String name : names) {
                File candidate = new File(dir.trim(), name);
                if (candidate.isFile() && candidate.canExecute()) {
                    return candidate.getAbsolutePath();
                }
            }
        }
        return null;
    }
}
