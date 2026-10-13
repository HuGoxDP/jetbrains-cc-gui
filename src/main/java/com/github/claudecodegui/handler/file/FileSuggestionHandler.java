package com.github.claudecodegui.handler.file;

import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.util.concurrency.AppExecutorUtil;

/**
 * Settings for Claude Code's {@code fileSuggestion} (ported from Swttch): the command of the
 * user's own that builds the {@code @} file list, in the user's settings file Claude Code
 * reads for this project.
 *
 * <p>Inbound: {@code get_file_suggestion}, {@code set_file_suggestion} {@code {command}}
 * (blank removes it). Outbound: {@code window.updateFileSuggestion} with {@code {command,
 * overriddenBy}} ({@code overriddenBy}: the project's settings file that sets its own
 * command, which wins) or {@code {error}}.
 */
public class FileSuggestionHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(FileSuggestionHandler.class);

    private static final String[] SUPPORTED_TYPES = {
            "get_file_suggestion",
            "set_file_suggestion",
    };

    public FileSuggestionHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if ("get_file_suggestion".equals(type)) {
            AppExecutorUtil.getAppExecutorService().execute(() -> reply(null));
            return true;
        }
        if ("set_file_suggestion".equals(type)) {
            String command = commandOf(content);
            AppExecutorUtil.getAppExecutorService().execute(() -> {
                try {
                    FileSuggestionCommand.setUserCommand(context.resolveEffectiveWorkingDirectory(), command);
                    reply(null);
                } catch (Exception e) {
                    LOG.warn("[FileSuggestion] Could not save: " + e.getMessage());
                    reply(e.getMessage() != null ? e.getMessage() : "failed");
                }
            });
            return true;
        }
        return false;
    }

    private void reply(String error) {
        String projectPath = context.resolveEffectiveWorkingDirectory();
        JsonObject payload = new JsonObject();
        payload.addProperty("command", FileSuggestionCommand.userCommand(projectPath));
        String overriddenBy = FileSuggestionCommand.projectSettingWith(projectPath);
        if (overriddenBy != null) {
            payload.addProperty("overriddenBy", ".claude/" + overriddenBy);
        }
        if (error != null) {
            payload.addProperty("error", error);
        }
        String json = payload.toString();
        ApplicationManager.getApplication().invokeLater(() -> callJavaScript("window.updateFileSuggestion", escapeJs(json)));
    }

    static String commandOf(String content) {
        if (content == null || content.isBlank()) {
            return null;
        }
        try {
            JsonElement parsed = JsonParser.parseString(content);
            JsonElement command = parsed.isJsonObject() ? parsed.getAsJsonObject().get("command") : null;
            return command != null && command.isJsonPrimitive() ? command.getAsString() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
