package com.github.claudecodegui.handler;

import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.schedule.ScheduledMessage;
import com.github.claudecodegui.schedule.ScheduledMessages;
import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.ui.toolwindow.ScheduledMessageCoordinator;
import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

/**
 * Webview bridge for scheduled messages ("send later", ported from Swttch).
 *
 * <p>Inbound: {@code get_scheduled_messages} {sessionId}, {@code schedule_message}
 * {sessionId, sendAt, message}, {@code update_scheduled_message} {id, sessionId, sendAt, message},
 * {@code cancel_scheduled_message} {id, sessionId}, {@code scheduled_message_delivered} {id, sessionId}.
 *
 * <p>Outbound: {@code updateScheduledMessages} (the conversation's list, with {@code error} when
 * a request was refused) and {@code deliverScheduledMessage} (a due message to send now).
 */
public class ScheduledMessageHandler extends BaseMessageHandler {

    private static final Logger LOG = Logger.getInstance(ScheduledMessageHandler.class);

    private static final String[] SUPPORTED_TYPES = {
            "get_scheduled_messages",
            "schedule_message",
            "update_scheduled_message",
            "cancel_scheduled_message",
            "scheduled_message_delivered",
    };

    private final Gson gson = new Gson();

    public ScheduledMessageHandler(HandlerContext context) {
        super(context);
        // Start the clock with the first chat tab, so messages come due without a tab asking.
        ApplicationManager.getApplication().executeOnPooledThread(ScheduledMessageCoordinator::service);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        JsonObject payload = parse(content);
        String sessionId = str(payload, "sessionId");
        if (sessionId == null) {
            return true;
        }
        ScheduledMessages service = ScheduledMessageCoordinator.service();
        try {
            switch (type) {
                case "get_scheduled_messages":
                    reply(sessionId, null);
                    deliverDue(service, sessionId);
                    return true;
                case "schedule_message": {
                    ClaudeSession session = context.getSession();
                    service.create(sessionId, str(payload, "sendAt"), rawStr(payload, "message"),
                            session != null ? session.getProvider() : null,
                            session != null ? session.getCwd() : null);
                    break;
                }
                case "update_scheduled_message":
                    service.update(str(payload, "id"), str(payload, "sendAt"), rawStr(payload, "message"));
                    break;
                case "cancel_scheduled_message":
                case "scheduled_message_delivered":
                    service.remove(str(payload, "id"));
                    break;
                default:
                    return false;
            }
        } catch (ScheduledMessages.Refused e) {
            reply(sessionId, e.code);
            return true;
        } catch (RuntimeException e) {
            LOG.warn("[Schedule] " + type + " failed: " + e.getMessage(), e);
            reply(sessionId, "failed");
            return true;
        }
        reply(sessionId, null);
        ScheduledMessageCoordinator.broadcast(sessionId);
        return true;
    }

    /** Hand the conversation's due messages to this tab, when it shows that conversation. */
    private void deliverDue(ScheduledMessages service, String sessionId) {
        ClaudeSession session = context.getSession();
        if (session == null || !sessionId.equals(session.getSessionId())) {
            return;
        }
        for (ScheduledMessage m : service.dueFor(sessionId)) {
            if (service.claim(m.id, session)) {
                context.callJavaScript(ScheduledMessageCoordinator.DELIVER_FUNCTION,
                        context.escapeJs(ScheduledMessageCoordinator.deliveryJson(m)));
            }
        }
    }

    private void reply(String sessionId, String error) {
        context.callJavaScript(ScheduledMessageCoordinator.UPDATE_FUNCTION,
                context.escapeJs(ScheduledMessageCoordinator.listJson(sessionId, error)));
    }

    private JsonObject parse(String content) {
        if (content == null || content.isBlank()) {
            return new JsonObject();
        }
        try {
            JsonObject parsed = gson.fromJson(content, JsonObject.class);
            return parsed != null ? parsed : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    /** A trimmed string field, or null when missing or blank. */
    private static String str(JsonObject payload, String key) {
        String value = rawStr(payload, key);
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** A string field exactly as sent (a message keeps its own spacing), or null. */
    private static String rawStr(JsonObject payload, String key) {
        JsonElement e = payload.get(key);
        if (e == null || e.isJsonNull() || !e.isJsonPrimitive()) {
            return null;
        }
        return e.getAsString();
    }
}
