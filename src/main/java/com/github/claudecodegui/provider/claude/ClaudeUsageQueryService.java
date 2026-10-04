package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.bridge.ProcessManager;
import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Asks the CLI for Claude plan usage ({@code /usage} data) through a one-shot bridge process.
 *
 * <p>Deliberately not routed through the daemon: the daemon serializes commands, so a usage
 * refresh would wait behind a running conversation turn.
 */
class ClaudeUsageQueryService {

    static final String USAGE_MARKER = "[CLAUDE_USAGE]";
    private static final String CHANNEL_SCRIPT = "channel-manager.js";
    private static final long TIMEOUT_SECONDS = 70;

    private final Logger log;
    private final Gson gson;
    private final NodeDetector nodeDetector;
    private final Supplier<File> sdkDirSupplier;
    private final ProcessManager processManager;
    private final EnvironmentConfigurator envConfigurator;

    ClaudeUsageQueryService(
            Logger log,
            Gson gson,
            NodeDetector nodeDetector,
            Supplier<File> sdkDirSupplier,
            ProcessManager processManager,
            EnvironmentConfigurator envConfigurator
    ) {
        this.log = log;
        this.gson = gson;
        this.nodeDetector = nodeDetector;
        this.sdkDirSupplier = sdkDirSupplier;
        this.processManager = processManager;
        this.envConfigurator = envConfigurator;
    }

    /**
     * @param cwd              working directory for the CLI (optional)
     * @param configDir        Claude config dir holding the login to ask about; null = live login
     * @param includeBehaviors also scan local transcripts for the usage breakdown
     * @return {@code {success, usage, account}} or {@code {success:false, error, errorKind}}
     */
    CompletableFuture<JsonObject> getPlanUsage(String cwd, String configDir, boolean includeBehaviors) {
        return CompletableFuture.supplyAsync(() -> {
            JsonObject stdin = new JsonObject();
            if (cwd != null && !cwd.isEmpty()) {
                stdin.addProperty("cwd", cwd);
            }
            if (configDir != null && !configDir.isEmpty()) {
                stdin.addProperty("configDir", configDir);
            }
            stdin.addProperty("includeBehaviors", includeBehaviors);
            return execute(stdin);
        });
    }

    private JsonObject execute(JsonObject stdinInput) {
        String channelId = "__claude_usage_" + UUID.randomUUID() + "__";
        Process process = null;
        long start = System.currentTimeMillis();
        try {
            String node = nodeDetector.findNodeExecutable();
            File bridgeDir = sdkDirSupplier.get();
            if (node == null || bridgeDir == null || !bridgeDir.exists()) {
                return failure("Node.js or the AI bridge is not ready yet", "unknown");
            }

            List<String> command = NodeDetector.buildNodeScriptCommand(
                    node, new File(bridgeDir, CHANNEL_SCRIPT).getAbsolutePath());
            command.add("claude");
            command.add("getUsage");

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(bridgeDir);
            pb.redirectErrorStream(true);
            envConfigurator.updateProcessEnvironment(pb, node);
            pb.environment().put("CLAUDE_USE_STDIN", "true");

            process = pb.start();
            processManager.registerProcess(channelId, process);
            ClaudeBridgeUtils.writeStdin(gson.toJson(stdinInput), process, log, "[ClaudeUsage]");

            final Process running = process;
            AtomicReference<String> marker = new AtomicReference<>();
            CountDownLatch done = new CountDownLatch(1);
            Thread reader = new Thread(() -> {
                try (BufferedReader in = new BufferedReader(
                        new InputStreamReader(running.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = in.readLine()) != null) {
                        if (line.startsWith(USAGE_MARKER)) {
                            marker.set(line.substring(USAGE_MARKER.length()).trim());
                            break;
                        }
                    }
                } catch (Exception e) {
                    log.debug("[ClaudeUsage] Reader stopped: " + e.getMessage());
                } finally {
                    done.countDown();
                }
            }, "claude-usage-reader");
            reader.setDaemon(true);
            reader.start();

            if (!done.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                return failure("Usage lookup timed out", "timeout");
            }
            String json = marker.get();
            if (json == null || json.isEmpty()) {
                return failure("The bridge exited without a usage answer", "unknown");
            }
            JsonObject parsed = gson.fromJson(json, JsonObject.class);
            log.info("[ClaudeUsage] Usage lookup finished in " + (System.currentTimeMillis() - start) + "ms"
                    + (parsed.has("success") && parsed.get("success").getAsBoolean() ? "" : " (failed)"));
            return parsed;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return failure("Usage lookup interrupted", "unknown");
        } catch (Exception e) {
            log.warn("[ClaudeUsage] Usage lookup failed: " + e.getMessage());
            return failure(e.getMessage() != null ? e.getMessage() : "Usage lookup failed", "unknown");
        } finally {
            if (process != null) {
                try {
                    if (process.isAlive()) {
                        PlatformUtils.terminateProcess(process);
                    }
                } finally {
                    processManager.unregisterProcess(channelId, process);
                }
            }
        }
    }

    private static JsonObject failure(String message, String kind) {
        JsonObject out = new JsonObject();
        out.addProperty("success", false);
        out.addProperty("error", message);
        out.addProperty("errorKind", kind);
        return out;
    }
}
