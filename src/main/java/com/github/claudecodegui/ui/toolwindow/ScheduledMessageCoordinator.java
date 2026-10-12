package com.github.claudecodegui.ui.toolwindow;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.i18n.ClaudeCodeGuiBundle;
import com.github.claudecodegui.schedule.ScheduledMessage;
import com.github.claudecodegui.schedule.ScheduledMessages;
import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.util.JsUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.project.Project;

import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * Connects the scheduled messages ({@link ScheduledMessages}) to the chat tabs.
 *
 * <p>A due message goes to a tab that shows its conversation; that tab sends it through its
 * normal send path (queued behind a running turn) and confirms. With no such tab, the message
 * waits and the open tabs of its project say so; it goes out as soon as a tab shows the
 * conversation, because every tab asks for its conversation's list when it changes.
 */
public final class ScheduledMessageCoordinator {

    /** Pushed to the chat: {@code {"sessionId", "schedules": [...], "error"?}}. */
    public static final String UPDATE_FUNCTION = "updateScheduledMessages";
    /** Pushed to the chat: one {@link ScheduledMessage} to send now. */
    public static final String DELIVER_FUNCTION = "deliverScheduledMessage";

    private static final Gson GSON = new Gson();
    private static volatile ScheduledMessages service;

    private ScheduledMessageCoordinator() {
    }

    /** The scheduled messages, started on first use. */
    public static ScheduledMessages service() {
        ScheduledMessages current = service;
        if (current == null) {
            synchronized (ScheduledMessageCoordinator.class) {
                current = service;
                if (current == null) {
                    current = new ScheduledMessages(
                            Paths.get(NodeDetector.resolveHomeForFileOps(), ".codemoss", "scheduled-messages.json"),
                            System::currentTimeMillis);
                    current.start(m -> ApplicationManager.getApplication().invokeLater(() -> deliver(m)));
                    service = current;
                }
            }
        }
        return current;
    }

    /** What the chat is told about a conversation's reservations. */
    public static String listJson(String sessionId, String error) {
        JsonObject o = new JsonObject();
        o.addProperty("sessionId", sessionId);
        o.add("schedules", GSON.toJsonTree(service().forSession(sessionId)));
        if (error != null) {
            o.addProperty("error", error);
        }
        return o.toString();
    }

    /** What the chat is handed to send. */
    public static String deliveryJson(ScheduledMessage m) {
        return GSON.toJson(m);
    }

    /** Tell every tab showing {@code sessionId} its current list. */
    public static void broadcast(String sessionId) {
        if (sessionId == null) {
            return;
        }
        String json = JsUtils.escapeJs(listJson(sessionId, null));
        for (ClaudeChatWindow window : showing(sessionId)) {
            window.callJavaScript(UPDATE_FUNCTION, json);
        }
    }

    /** A reservation came due: hand it to a tab showing its conversation, or say it waits. */
    static void deliver(ScheduledMessage m) {
        List<ClaudeChatWindow> tabs = showing(m.sessionId);
        if (!tabs.isEmpty()) {
            ClaudeChatWindow tab = tabs.get(0);
            if (service().claim(m.id, tab.getSession())) {
                tab.callJavaScript(DELIVER_FUNCTION, JsUtils.escapeJs(deliveryJson(m)));
            }
            return;
        }
        List<ClaudeChatWindow> here = new ArrayList<>();
        List<ClaudeChatWindow> all = new ArrayList<>();
        for (ClaudeChatWindow window : ClaudeSDKToolWindow.getAllChatWindows()) {
            if (window.isDisposed()) {
                continue;
            }
            all.add(window);
            if (inProject(window.getProject(), m.cwd)) {
                here.add(window);
            }
        }
        String text = ClaudeCodeGuiBundle.message("schedule.dueNotShown");
        for (ClaudeChatWindow window : here.isEmpty() ? all : here) {
            window.showToast(text, "info");
        }
    }

    private static List<ClaudeChatWindow> showing(String sessionId) {
        List<ClaudeChatWindow> tabs = new ArrayList<>();
        for (ClaudeChatWindow window : ClaudeSDKToolWindow.getAllChatWindows()) {
            ClaudeSession session = window.isDisposed() ? null : window.getSession();
            if (session != null && sessionId.equals(session.getSessionId())) {
                tabs.add(window);
            }
        }
        return tabs;
    }

    private static boolean inProject(Project project, String cwd) {
        String base = project == null ? null : project.getBasePath();
        if (base == null || cwd == null) {
            return false;
        }
        String b = base.replace('\\', '/');
        String c = cwd.replace('\\', '/');
        return c.equals(b) || c.startsWith(b.endsWith("/") ? b : b + "/");
    }
}
