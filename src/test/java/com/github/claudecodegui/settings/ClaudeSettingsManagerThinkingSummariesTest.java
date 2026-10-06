package com.github.claudecodegui.settings;

import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Claude Code's own {@code showThinkingSummaries}, as the Behavior tab reads and
 * writes it in ~/.claude/settings.json.
 */
public class ClaudeSettingsManagerThinkingSummariesTest {
    private String originalHomeDir;
    private Path settingsPath;

    @Before
    public void setUp() throws Exception {
        Path tempHome = Files.createTempDirectory("claude-thinking-summaries");
        originalHomeDir = getCachedHomeDirectory();
        setCachedHomeDirectory(tempHome.toString());
        settingsPath = tempHome.resolve(".claude").resolve("settings.json");
    }

    @After
    public void tearDown() throws Exception {
        setCachedHomeDirectory(originalHomeDir);
    }

    @Test
    public void absentMeansOff() throws Exception {
        assertFalse(newManager().getShowThinkingSummaries());
    }

    @Test
    public void turningItOnWritesOnlyThatKeyAndKeepsTheRest() throws Exception {
        Files.createDirectories(settingsPath.getParent());
        Files.writeString(settingsPath, "{\"model\":\"opus\",\"env\":{\"FOO\":\"bar\"}}", StandardCharsets.UTF_8);

        ClaudeSettingsManager manager = newManager();
        manager.setShowThinkingSummaries(true);

        JsonObject after = read();
        assertTrue(after.get("showThinkingSummaries").getAsBoolean());
        assertEquals("opus", after.get("model").getAsString());
        assertEquals("{\"FOO\":\"bar\"}", after.get("env").toString());
        assertTrue(manager.getShowThinkingSummaries());
    }

    @Test
    public void turningItOffRemovesTheKey() throws Exception {
        Files.createDirectories(settingsPath.getParent());
        Files.writeString(settingsPath, "{\"showThinkingSummaries\":true,\"model\":\"opus\"}", StandardCharsets.UTF_8);

        newManager().setShowThinkingSummaries(false);

        JsonObject after = read();
        assertFalse(after.has("showThinkingSummaries"));
        assertEquals("opus", after.get("model").getAsString());
    }

    @Test
    public void createsTheFileWhenThereIsNone() throws Exception {
        newManager().setShowThinkingSummaries(true);
        assertTrue(read().get("showThinkingSummaries").getAsBoolean());
    }

    @Test
    public void leavesAnUnreadableFileAloneAndFails() throws Exception {
        Files.createDirectories(settingsPath.getParent());
        String broken = "{\"model\":\"opus\",";
        Files.writeString(settingsPath, broken, StandardCharsets.UTF_8);

        try {
            newManager().setShowThinkingSummaries(true);
            fail("expected the write to be refused");
        } catch (IOException expected) {
            // refused
        }
        assertEquals(broken, Files.readString(settingsPath, StandardCharsets.UTF_8));
    }

    private JsonObject read() throws IOException {
        return JsonParser.parseString(Files.readString(settingsPath, StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static ClaudeSettingsManager newManager() {
        Gson gson = new GsonBuilder().setPrettyPrinting().serializeNulls().create();
        return new ClaudeSettingsManager(gson, new ConfigPathManager());
    }

    private static String getCachedHomeDirectory() throws Exception {
        Field field = PlatformUtils.class.getDeclaredField("cachedRealHomeDir");
        field.setAccessible(true);
        return (String) field.get(null);
    }

    private static void setCachedHomeDirectory(String homeDir) throws Exception {
        Field field = PlatformUtils.class.getDeclaredField("cachedRealHomeDir");
        field.setAccessible(true);
        field.set(null, homeDir);
    }
}
