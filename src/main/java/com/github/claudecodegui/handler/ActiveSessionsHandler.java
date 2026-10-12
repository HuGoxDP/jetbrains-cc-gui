package com.github.claudecodegui.handler;

import com.github.claudecodegui.account.ClaudeLoginService;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.provider.claude.ActiveClaudeSessions;
import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.settings.ClaudeConfigDir;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * The other Claude sessions running on this machine, for the composer's {@code @@} mention
 * (ported from Swttch). The list is the official {@code claude agents --json}, so it is the
 * list a terminal user sees; it is read again on every request, since sessions come and go.
 *
 * <p>Inbound: {@code get_active_sessions}. Outbound: {@code updateActiveSessions} with
 * {@code {agents, entries, selfSessionId}} or {@code {error}}.
 */
public class ActiveSessionsHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(ActiveSessionsHandler.class);
    private static final long TIMEOUT_SECONDS = 10;

    private static final String[] SUPPORTED_TYPES = {
            "get_active_sessions",
    };

    public ActiveSessionsHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if (!"get_active_sessions".equals(type)) {
            return false;
        }
        AppExecutorUtil.getAppExecutorService().execute(this::reply);
        return true;
    }

    private void reply() {
        JsonObject payload;
        try {
            String cwd = context.resolveEffectiveWorkingDirectory();
            ClaudeSession session = context.getSession();
            JsonArray agents = ActiveClaudeSessions.parseAgents(runAgents(cwd));
            payload = ActiveClaudeSessions.payload(agents, ClaudeConfigDir.projectsDir(cwd),
                    session != null ? session.getSessionId() : null);
        } catch (Exception e) {
            LOG.warn("[ActiveSessions] claude agents --json failed: " + e.getMessage());
            payload = new JsonObject();
            payload.addProperty("error", e.getMessage() != null ? e.getMessage() : "failed");
        }
        callJavaScript("updateActiveSessions", escapeJs(payload.toString()));
    }

    private static String runAgents(String cwd) throws IOException, InterruptedException {
        String nodePath = NodeDetector.getInstance().getCachedNodePath();
        if (nodePath != null && NodeDetector.isWslPath(nodePath)) {
            throw new IOException("wsl");
        }
        String binary = ClaudeLoginService.resolveClaudeBinary();
        if (binary == null) {
            throw new IOException("cli_not_found");
        }
        List<String> command = new ArrayList<>();
        if (binary.toLowerCase(Locale.ROOT).endsWith(".cmd")) {
            // npm shims are batch files: CreateProcess cannot start them directly.
            command.add("cmd");
            command.add("/c");
        }
        command.add(binary);
        command.add("agents");
        command.add("--json");
        ProcessBuilder builder = new ProcessBuilder(command);
        // Output goes to a file, so a CLI that hangs cannot block the read past the timeout.
        File out = File.createTempFile("claude-agents", ".json");
        try {
            builder.redirectOutput(out);
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            ClaudeConfigDir.applyTo(builder.environment(), cwd, null);
            if (cwd != null && new File(cwd).isDirectory()) {
                builder.directory(new File(cwd));
            }
            Process process = builder.start();
            process.getOutputStream().close();
            if (!process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IOException("timeout");
            }
            return Files.readString(out.toPath(), StandardCharsets.UTF_8);
        } finally {
            Files.deleteIfExists(out.toPath());
        }
    }
}
