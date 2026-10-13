package com.github.claudecodegui.handler;

import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.session.ClaudeSession;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

import java.util.concurrent.CompletableFuture;

/**
 * {@code /btw} and {@code /reload-plugins} (ported from Swttch): commands the terminal runs
 * on the live Claude process without adding a turn to the conversation. Both go to the
 * conversation's runtime through the SDK's query, beside a turn in progress.
 *
 * <p>Inbound: {@code ask_side_question} {@code {requestId, question}} and
 * {@code reload_plugins} {@code {requestId}}. Outbound: {@code window.onSideQuestionResult}
 * and {@code window.onReloadPluginsResult} with {@code {requestId, ok, answer | result,
 * reason}}.
 */
public class SideCommandsHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(SideCommandsHandler.class);

    static final String ASK_SIDE_QUESTION = "ask_side_question";
    static final String RELOAD_PLUGINS = "reload_plugins";

    private static final String[] SUPPORTED_TYPES = {
            ASK_SIDE_QUESTION,
            RELOAD_PLUGINS,
    };

    public SideCommandsHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if (ASK_SIDE_QUESTION.equals(type)) {
            askSideQuestion(parse(content));
            return true;
        }
        if (RELOAD_PLUGINS.equals(type)) {
            reloadPlugins(parse(content));
            return true;
        }
        return false;
    }

    private void askSideQuestion(JsonObject request) {
        String requestId = string(request, "requestId");
        String question = string(request, "question");
        String refusal = refusal(question == null ? "empty" : null);
        if (refusal != null) {
            reply("window.onSideQuestionResult", requestId, failure(refusal));
            return;
        }
        ClaudeSession session = context.getSession();
        String sessionId = session.getSessionId();
        String epoch = session.getRuntimeSessionEpoch();
        ClaudeSDKBridge bridge = context.getClaudeSDKBridge();
        bridge.askSideQuestionLive(sessionId, epoch, question)
                .thenCompose(first -> {
                    if (!"no-runtime".equals(reason(first))) {
                        return CompletableFuture.completedFuture(first);
                    }
                    // The conversation has no running process (opened from History, or
                    // idle long enough to be closed): start it, as sending would, and ask.
                    String cwd = session.getCwd() != null ? session.getCwd() : context.resolveEffectiveWorkingDirectory();
                    return bridge.preconnectSession(cwd, epoch, sessionId)
                            .thenCompose(started -> Boolean.TRUE.equals(started)
                                    ? bridge.askSideQuestionLive(sessionId, epoch, question)
                                    : CompletableFuture.completedFuture(first));
                })
                .exceptionally(ex -> failure(ex.getMessage()))
                .thenAccept(result -> reply("window.onSideQuestionResult", requestId, result));
    }

    private void reloadPlugins(JsonObject request) {
        String requestId = string(request, "requestId");
        String refusal = refusal(null);
        if (refusal != null) {
            reply("window.onReloadPluginsResult", requestId, failure(refusal));
            return;
        }
        ClaudeSession session = context.getSession();
        context.getClaudeSDKBridge()
                .reloadPluginsLive(session.getSessionId(), session.getRuntimeSessionEpoch())
                .exceptionally(ex -> failure(ex.getMessage()))
                .thenAccept(result -> reply("window.onReloadPluginsResult", requestId, result));
    }

    /** Why the command cannot run in this tab, or null when it can. */
    private String refusal(String inputProblem) {
        if (inputProblem != null) {
            return inputProblem;
        }
        String provider = context.getCurrentProvider();
        if (provider != null && !provider.isEmpty() && !"claude".equals(provider)) {
            return "unsupported-provider";
        }
        ClaudeSession session = context.getSession();
        if (session == null || session.getSessionId() == null || session.getSessionId().isBlank()) {
            return "no-session";
        }
        return null;
    }

    private void reply(String function, String requestId, JsonObject result) {
        JsonObject payload = result != null ? result.deepCopy() : failure("failed");
        if (requestId != null) {
            payload.addProperty("requestId", requestId);
        }
        if (!payload.has("ok") || !payload.get("ok").getAsBoolean()) {
            LOG.info("[SideCommands] " + function + " failed: " + reason(payload));
        }
        String json = payload.toString();
        ApplicationManager.getApplication().invokeLater(() -> callJavaScript(function, escapeJs(json)));
    }

    static JsonObject failure(String reason) {
        JsonObject result = new JsonObject();
        result.addProperty("ok", false);
        result.addProperty("reason", reason != null && !reason.isBlank() ? reason : "failed");
        return result;
    }

    static String reason(JsonObject result) {
        if (result == null) {
            return "failed";
        }
        JsonElement reason = result.get("reason");
        return reason != null && reason.isJsonPrimitive() ? reason.getAsString() : null;
    }

    static JsonObject parse(String content) {
        if (content == null || content.isBlank()) {
            return new JsonObject();
        }
        try {
            JsonElement parsed = JsonParser.parseString(content);
            return parsed.isJsonObject() ? parsed.getAsJsonObject() : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    static String string(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive()) {
            return null;
        }
        String text = value.getAsString().trim();
        return text.isEmpty() ? null : text;
    }
}
