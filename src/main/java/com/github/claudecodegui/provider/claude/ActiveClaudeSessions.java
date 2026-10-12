package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.util.PathUtils;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The Claude sessions running on this machine, as the official {@code claude agents --json}
 * prints them (ported from Swttch's {@code @@} mention).
 *
 * <p>The CLI's array travels unedited. Beside it, each session whose transcript can be read
 * gets the title the history list would show for it, keyed by session id, so a row reads
 * the same here as in History.
 */
public final class ActiveClaudeSessions {

    private ActiveClaudeSessions() {
    }

    /**
     * The JSON array in the CLI's output. Text printed around it (a shell notice, a warning)
     * is ignored; anything that is not an array answers an empty one.
     */
    public static JsonArray parseAgents(String stdout) {
        if (stdout == null) {
            return new JsonArray();
        }
        String trimmed = stdout.trim();
        int start = trimmed.indexOf('[');
        int end = trimmed.lastIndexOf(']');
        if (start < 0 || end <= start) {
            return new JsonArray();
        }
        try {
            JsonElement parsed = JsonParser.parseString(trimmed.substring(start, end + 1));
            return parsed.isJsonArray() ? parsed.getAsJsonArray() : new JsonArray();
        } catch (RuntimeException e) {
            return new JsonArray();
        }
    }

    /** Where Claude Code keeps the transcript of {@code sessionId} started in {@code cwd}. */
    public static Path transcriptPath(Path projectsDir, String cwd, String sessionId) {
        return projectsDir.resolve(PathUtils.sanitizePath(cwd)).resolve(sessionId + ".jsonl");
    }

    /**
     * What the chat is told: {@code {"agents": [...], "entries": {sessionId: {title,
     * lastTimestamp, messageCount}}, "selfSessionId"}}. {@code projectsDir} is where the
     * transcripts are.
     */
    public static JsonObject payload(JsonArray agents, Path projectsDir, String selfSessionId) {
        JsonObject entries = new JsonObject();
        ClaudeHistoryParser parser = new ClaudeHistoryParser();
        for (JsonElement e : agents) {
            if (!e.isJsonObject()) {
                continue;
            }
            JsonObject agent = e.getAsJsonObject();
            String sessionId = string(agent, "sessionId");
            String cwd = string(agent, "cwd");
            if (sessionId == null || cwd == null || projectsDir == null) {
                continue;
            }
            Path transcript = transcriptPath(projectsDir, cwd, sessionId);
            if (!Files.isRegularFile(transcript)) {
                continue;
            }
            ClaudeHistoryReader.SessionInfo info = parser.scanSingleSession(transcript);
            if (info == null) {
                continue;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("sessionId", sessionId);
            entry.addProperty("title", info.title);
            entry.addProperty("lastTimestamp", info.lastTimestamp);
            entry.addProperty("messageCount", info.messageCount);
            entries.add(sessionId, entry);
        }
        JsonObject payload = new JsonObject();
        payload.add("agents", agents);
        payload.add("entries", entries);
        payload.addProperty("selfSessionId", selfSessionId);
        return payload;
    }

    private static String string(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return e != null && e.isJsonPrimitive() && !e.getAsString().isBlank() ? e.getAsString() : null;
    }
}
