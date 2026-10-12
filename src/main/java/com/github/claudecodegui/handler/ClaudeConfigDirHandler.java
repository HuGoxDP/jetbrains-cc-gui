package com.github.claudecodegui.handler;

import com.github.claudecodegui.cache.SessionIndexCache;
import com.github.claudecodegui.cache.SessionIndexManager;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.settings.ClaudeConfigDir;
import com.github.claudecodegui.settings.CodemossSettingsService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;

/**
 * Settings → Basic → Environment → CLAUDE_CONFIG_DIR: the folder Claude keeps its
 * settings, login and session history in, chosen for all projects or for this one
 * (ported from Swttch). Stored in ~/.codemoss/config.json; see {@link ClaudeConfigDir}
 * for how a value applies.
 */
public class ClaudeConfigDirHandler {

    private static final Logger LOG = Logger.getInstance(ClaudeConfigDirHandler.class);
    private static final String CALLBACK = "window.updateClaudeConfigDir";

    private final HandlerContext context;
    private final CodemossSettingsService settingsService;
    private final Gson gson = new Gson();

    public ClaudeConfigDirHandler(HandlerContext context) {
        this.context = context;
        this.settingsService = context.getSettingsService();
    }

    public void handleGet() {
        CompletableFuture.runAsync(() -> {
            try {
                push(info(null));
            } catch (Exception e) {
                LOG.warn("[ClaudeConfigDir] Failed to read: " + e.getMessage(), e);
                push(errorInfo(e.getMessage()));
            }
        }, AppExecutorUtil.getAppExecutorService());
    }

    /** Payload {@code {scope: "global" | "project", value: string}}; a blank value clears it. */
    public void handleSet(String content) {
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject json = gson.fromJson(content, JsonObject.class);
                String scope = json != null && json.has("scope") ? json.get("scope").getAsString() : "global";
                String value = json != null && json.has("value") && !json.get("value").isJsonNull()
                        ? json.get("value").getAsString() : "";
                String problem = ClaudeConfigDir.problemWith(value);
                if (problem != null) {
                    push(info(problem));
                    return;
                }
                String projectPath = projectPath();
                if ("project".equals(scope) && projectPath == null) {
                    push(info("This project has no folder to keep a value for"));
                    return;
                }
                JsonObject config = settingsService.readConfig();
                if ("project".equals(scope)) {
                    ClaudeConfigDir.setProject(config, projectPath, value);
                } else {
                    ClaudeConfigDir.setGlobal(config, value);
                }
                settingsService.writeConfig(config);
                ClaudeConfigDir.invalidate();
                // The session lists were read from the old folder.
                SessionIndexCache.getInstance().clearAll();
                SessionIndexManager.getInstance().clearAllIndexes();
                LOG.info("[ClaudeConfigDir] Set " + scope + " value: " + (value.isBlank() ? "(none)" : value.trim()));
                push(info(null));
            } catch (Exception e) {
                LOG.warn("[ClaudeConfigDir] Failed to save: " + e.getMessage(), e);
                push(errorInfo(e.getMessage()));
            }
        }, AppExecutorUtil.getAppExecutorService());
    }

    private String projectPath() {
        return context.getProject() != null ? context.getProject().getBasePath() : null;
    }

    /** What the settings field shows: both values, and the folder that applies here and why. */
    private JsonObject info(String error) throws IOException {
        String projectPath = projectPath();
        JsonObject config = settingsService.readConfig();
        String global = ClaudeConfigDir.getGlobal(config);
        String project = ClaudeConfigDir.getProject(config, projectPath);
        ClaudeConfigDir.Resolution resolution = ClaudeConfigDir.resolveFor(projectPath);

        JsonObject out = new JsonObject();
        out.addProperty("hasProject", projectPath != null);
        out.addProperty("globalValue", global != null ? global : "");
        out.addProperty("projectValue", project != null ? project : "");
        out.addProperty("effective", ClaudeConfigDir.dir(projectPath).toString());
        out.addProperty("source", resolution.source().name().toLowerCase(Locale.ROOT));
        if (resolution.source() == ClaudeConfigDir.Source.PROJECT && projectPath != null
                && !projectPath.equals(resolution.project())) {
            // Set on a project this one is inside of.
            out.addProperty("fromProject", resolution.project());
        }
        if (error != null) {
            out.addProperty("error", error);
        }
        return out;
    }

    private JsonObject errorInfo(String message) {
        JsonObject out = new JsonObject();
        out.addProperty("error", message != null ? message : "Unknown error");
        return out;
    }

    private void push(JsonObject payload) {
        String json = gson.toJson(payload);
        ApplicationManager.getApplication().invokeLater(() ->
                context.callJavaScript(CALLBACK, context.escapeJs(json)));
    }
}
