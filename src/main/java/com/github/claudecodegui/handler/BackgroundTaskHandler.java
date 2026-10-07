package com.github.claudecodegui.handler;

import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.session.ClaudeSession;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

/**
 * Stops one background task (an Agent or Bash call run in the background) from
 * the status panel, without stopping the conversation or the turn in progress.
 * Ported from the Claude Code GUI ("Swttch") plugin's background tasks panel.
 *
 * Only the Claude provider can do it: the request goes to the live runtime's
 * SDK query (Query.stopTask). The answer reaches the webview through
 * window.onBackgroundTaskStopResult, which says why when nothing was stopped.
 */
public class BackgroundTaskHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(BackgroundTaskHandler.class);

    private static final String[] SUPPORTED_TYPES = {
            "stop_background_task",
    };

    public BackgroundTaskHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if (!"stop_background_task".equals(type)) {
            return false;
        }
        handleStop(content);
        return true;
    }

    /**
     * Reads a stop request: {toolUseId, agentId?}. Returns {toolUseId, agentId},
     * either null when missing, blank or unreadable.
     */
    static String[] parseStopRequest(String content) {
        String[] result = new String[2];
        if (content == null || content.isBlank()) {
            return result;
        }
        try {
            JsonObject payload = JsonParser.parseString(content).getAsJsonObject();
            result[0] = stringOrNull(payload, "toolUseId");
            result[1] = stringOrNull(payload, "agentId");
        } catch (Exception e) {
            LOG.warn("[BackgroundTaskHandler] Unreadable stop request: " + e.getMessage());
        }
        return result;
    }

    private void handleStop(String content) {
        String[] request = parseStopRequest(content);
        String toolUseId = request[0];
        String taskId = request[1];
        if (toolUseId == null) {
            reply(null, false, "unknown-task");
            return;
        }

        String provider = context.getCurrentProvider();
        if (provider != null && !provider.isEmpty() && !"claude".equals(provider)) {
            reply(toolUseId, false, "unsupported");
            return;
        }
        ClaudeSession session = context.getSession();
        if (session == null) {
            reply(toolUseId, false, "no-runtime");
            return;
        }

        final String id = toolUseId;
        context.getClaudeSDKBridge()
                .stopTaskLive(session.getSessionId(), session.getRuntimeSessionEpoch(), toolUseId, taskId)
                .thenAccept(result -> {
                    boolean stopped = result.has("success") && result.get("success").getAsBoolean();
                    String error = result.has("error") && !result.get("error").isJsonNull()
                            ? result.get("error").getAsString()
                            : null;
                    LOG.info("[BackgroundTaskHandler] stop " + id + ": "
                            + (stopped ? "stopped" : "not stopped (" + error + ")"));
                    reply(id, stopped, error);
                })
                .exceptionally(ex -> {
                    reply(id, false, ex.getMessage());
                    return null;
                });
    }

    private void reply(String toolUseId, boolean stopped, String error) {
        JsonObject result = new JsonObject();
        if (toolUseId != null) {
            result.addProperty("toolUseId", toolUseId);
        }
        result.addProperty("stopped", stopped);
        if (error != null) {
            result.addProperty("error", error);
        }
        String json = result.toString();
        ApplicationManager.getApplication().invokeLater(() ->
                callJavaScript("window.onBackgroundTaskStopResult", escapeJs(json)));
    }

    private static String stringOrNull(JsonObject payload, String key) {
        if (!payload.has(key) || !payload.get(key).isJsonPrimitive()) {
            return null;
        }
        String value = payload.get(key).getAsString().trim();
        return value.isEmpty() ? null : value;
    }
}
