package com.github.claudecodegui.provider.claude;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ActiveClaudeSessionsTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static final String AGENTS = "[\n  {\n    \"pid\": 123,\n    \"cwd\": \"/work/app\",\n"
            + "    \"kind\": \"interactive\",\n    \"startedAt\": 1791824197526,\n"
            + "    \"sessionId\": \"11111111-aaaa\",\n    \"name\": \"app-86\",\n    \"status\": \"busy\"\n  },\n"
            + "  {\"pid\": 7, \"cwd\": \"/work/docs\", \"kind\": \"interactive\", \"startedAt\": 1,"
            + " \"sessionId\": \"22222222-bbbb\", \"name\": \"docs-2\"}\n]\n";

    @Test
    public void readsTheArrayTheCliPrints() {
        assertEquals(2, ActiveClaudeSessions.parseAgents(AGENTS).size());
        assertEquals(2, ActiveClaudeSessions.parseAgents("Notice: update available\n" + AGENTS).size());
        assertEquals(0, ActiveClaudeSessions.parseAgents("").size());
        assertEquals(0, ActiveClaudeSessions.parseAgents(null).size());
        assertEquals(0, ActiveClaudeSessions.parseAgents("[not json").size());
        assertEquals(0, ActiveClaudeSessions.parseAgents("{\"a\": 1}").size());
    }

    @Test
    public void namesEachSessionAsHistoryDoes() throws Exception {
        Path projects = tmp.newFolder("projects").toPath();
        Path transcript = ActiveClaudeSessions.transcriptPath(projects, "/work/app", "11111111-aaaa");
        assertEquals(projects.resolve("-work-app").resolve("11111111-aaaa.jsonl"), transcript);
        Files.createDirectories(transcript.getParent());
        Files.writeString(transcript,
                "{\"type\":\"user\",\"timestamp\":\"2026-10-12T09:00:00Z\",\"message\":{\"role\":\"user\","
                        + "\"content\":\"Review the pull request on this branch\"}}\n"
                        + "{\"type\":\"assistant\",\"timestamp\":\"2026-10-12T09:05:00Z\",\"message\":{\"role\":\"assistant\","
                        + "\"content\":[{\"type\":\"text\",\"text\":\"On it.\"}]}}\n");

        JsonArray agents = ActiveClaudeSessions.parseAgents(AGENTS);
        JsonObject payload = ActiveClaudeSessions.payload(agents, projects, "22222222-bbbb");

        // The CLI's array travels unedited.
        assertEquals(agents, payload.getAsJsonArray("agents"));
        assertEquals("busy", payload.getAsJsonArray("agents").get(0).getAsJsonObject().get("status").getAsString());
        assertEquals("22222222-bbbb", payload.get("selfSessionId").getAsString());

        JsonObject entries = payload.getAsJsonObject("entries");
        assertTrue(entries.has("11111111-aaaa"));
        assertFalse(entries.has("22222222-bbbb"));
        JsonObject entry = entries.getAsJsonObject("11111111-aaaa");
        assertEquals("Review the pull request on this branch", entry.get("title").getAsString());
        assertEquals(2, entry.get("messageCount").getAsInt());
        assertTrue(entry.get("lastTimestamp").getAsLong() > 0);
    }
}
