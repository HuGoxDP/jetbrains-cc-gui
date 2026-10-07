package com.github.claudecodegui.ui.toolwindow;

import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.ui.ChatWindowDelegate.TabAnswerStatus;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * What the open chat tabs of a project are doing, for the history list's
 * activity dots and its Active filter. Ported from the Claude Code GUI
 * ("Swttch") plugin's session activity markers.
 *
 * The answer is the tab status each window already keeps for its tab title
 * ({@link TabAnswerStatus}), keyed by the session the tab shows. It is pushed to
 * every chat window of the project whenever a tab's status changes, and on
 * request when the history list opens, as {@code window.onSessionActivity(json)}
 * with {@code { "<sessionId>": "running" | "awaiting" | "done" | "open" }}.
 * A session that is not open in any tab is absent.
 */
public final class SessionActivity {

    private static final Logger LOG = Logger.getInstance(SessionActivity.class);
    private static final Gson GSON = new Gson();

    public static final String RUNNING = "running";
    public static final String AWAITING = "awaiting";
    public static final String DONE = "done";
    public static final String OPEN = "open";

    private SessionActivity() {
    }

    /** The activity a tab status stands for. */
    public static String stateOf(TabAnswerStatus status) {
        if (status == null) {
            return OPEN;
        }
        switch (status) {
            case ANSWERING:
                return RUNNING;
            case WAITING:
                return AWAITING;
            case COMPLETED:
                return DONE;
            case IDLE:
            default:
                return OPEN;
        }
    }

    /**
     * The one of two states to show when a session is open in two tabs: the one
     * that asks more of the user.
     */
    static String stronger(String a, String b) {
        return rank(a) >= rank(b) ? a : b;
    }

    private static int rank(String state) {
        switch (state) {
            case AWAITING:
                return 3;
            case RUNNING:
                return 2;
            case DONE:
                return 1;
            default:
                return 0;
        }
    }

    /** The states as the webview receives them, from (sessionId, status) pairs. */
    static String snapshotJson(Map<String, TabAnswerStatus> statuses) {
        Map<String, String> states = new LinkedHashMap<>();
        for (Map.Entry<String, TabAnswerStatus> entry : statuses.entrySet()) {
            String sessionId = entry.getKey();
            if (sessionId == null || sessionId.isEmpty()) {
                continue;
            }
            states.merge(sessionId, stateOf(entry.getValue()), SessionActivity::stronger);
        }
        JsonObject json = new JsonObject();
        states.forEach(json::addProperty);
        return json.toString();
    }

    /** Push the project's session activity to each of its chat windows. */
    public static void broadcast(Project project) {
        if (project == null || project.isDisposed()) {
            return;
        }
        try {
            Set<ClaudeChatWindow> windows = ClaudeSDKToolWindow.getAllChatWindowsForProject(project);
            // A list of pairs rather than a map: two tabs can show one session.
            Map<String, TabAnswerStatus> statuses = new LinkedHashMap<>();
            for (ClaudeChatWindow window : windows) {
                ClaudeSession session = window.getSession();
                String sessionId = session == null ? null : session.getSessionId();
                if (sessionId == null || sessionId.isEmpty()) {
                    continue;
                }
                TabAnswerStatus status = window.getTabAnswerStatus();
                TabAnswerStatus known = statuses.get(sessionId);
                if (known == null || rank(stateOf(status)) > rank(stateOf(known))) {
                    statuses.put(sessionId, status);
                }
            }
            String script = "window.onSessionActivity && window.onSessionActivity("
                    + GSON.toJson(snapshotJson(statuses)) + ");";
            for (ClaudeChatWindow window : windows) {
                window.executeJavaScriptCode(script);
            }
        } catch (Exception e) {
            LOG.debug("[SessionActivity] broadcast skipped: " + e.getMessage());
        }
    }
}
