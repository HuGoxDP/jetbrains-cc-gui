package com.github.claudecodegui.handler.file;

import com.google.gson.JsonParser;
import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

/**
 * Claude Code's fileSuggestion setting: a command of the user's own builds the @ list.
 */
public class FileSuggestionCommandTest {

    @Test
    public void readsTheCommandOfAFileSuggestionSetting() {
        assertEquals("git ls-files", FileSuggestionCommand.parse(JsonParser.parseString(
                "{\"fileSuggestion\": {\"type\": \"command\", \"command\": \"git ls-files\"}}").getAsJsonObject()));
    }

    @Test
    public void ignoresAnythingElse() {
        assertNull(FileSuggestionCommand.parse(JsonParser.parseString("{}").getAsJsonObject()));
        assertNull(FileSuggestionCommand.parse(JsonParser.parseString(
                "{\"fileSuggestion\": {\"type\": \"script\", \"command\": \"x\"}}").getAsJsonObject()));
        assertNull(FileSuggestionCommand.parse(JsonParser.parseString(
                "{\"fileSuggestion\": {\"type\": \"command\", \"command\": \"  \"}}").getAsJsonObject()));
        assertNull(FileSuggestionCommand.parse(JsonParser.parseString(
                "{\"fileSuggestion\": \"git ls-files\"}").getAsJsonObject()));
    }

    @Test
    public void usesTheFirstFifteenNonEmptyLines() {
        StringBuilder out = new StringBuilder("\n");
        for (int i = 0; i < 20; i++) {
            out.append("  file").append(i).append(".ts \r\n\n");
        }
        List<String> lines = FileSuggestionCommand.lines(out.toString());
        assertEquals(FileSuggestionCommand.RESULT_CAP, lines.size());
        assertEquals("file0.ts", lines.get(0));
        assertEquals("file14.ts", lines.get(14));
    }

    @Test
    public void theLocalProjectSettingWins() throws IOException {
        Path project = Files.createTempDirectory("file-suggestion");
        Path claude = Files.createDirectories(project.resolve(".claude"));
        Files.writeString(claude.resolve("settings.json"),
                "{\"fileSuggestion\": {\"type\": \"command\", \"command\": \"shared\"}}", StandardCharsets.UTF_8);
        Files.writeString(claude.resolve("settings.local.json"),
                "{\"fileSuggestion\": {\"type\": \"command\", \"command\": \"mine\"}}", StandardCharsets.UTF_8);

        assertEquals("mine", FileSuggestionCommand.commandFor(project.toString()));
    }

    @Test
    public void theProjectSettingWinsOverTheUsersAndIsNamed() throws IOException {
        Path project = Files.createTempDirectory("file-suggestion");
        Path claude = Files.createDirectories(project.resolve(".claude"));
        Files.writeString(claude.resolve("settings.json"),
                "{\"fileSuggestion\": {\"type\": \"command\", \"command\": \"shared\"}}", StandardCharsets.UTF_8);

        assertEquals("settings.json", FileSuggestionCommand.projectSettingWith(project.toString()));
        assertEquals("shared", FileSuggestionCommand.commandFor(project.toString()));
    }

    @Test
    public void setsAndRemovesTheCommandKeepingTheRestOfTheFile() throws IOException {
        Path file = Files.createTempDirectory("file-suggestion").resolve("settings.json");
        Files.writeString(file, "{\"model\": \"x\"}", StandardCharsets.UTF_8);

        FileSuggestionCommand.setCommandIn(file, "  git ls-files  ");
        assertEquals("git ls-files", FileSuggestionCommand.commandIn(file));
        assertEquals("x", JsonParser.parseString(Files.readString(file)).getAsJsonObject().get("model").getAsString());

        FileSuggestionCommand.setCommandIn(file, " ");
        assertNull(FileSuggestionCommand.commandIn(file));
        assertEquals("x", JsonParser.parseString(Files.readString(file)).getAsJsonObject().get("model").getAsString());
    }

    @Test
    public void createsTheSettingsFileWhenThereIsNone() throws IOException {
        Path file = Files.createTempDirectory("file-suggestion").resolve("claude").resolve("settings.json");

        FileSuggestionCommand.setCommandIn(file, "fd --type f");

        assertEquals("fd --type f", FileSuggestionCommand.commandIn(file));
    }

    @Test
    public void leavesAnUnreadableSettingsFileAlone() throws IOException {
        Path file = Files.createTempDirectory("file-suggestion").resolve("settings.json");
        Files.writeString(file, "{ not json", StandardCharsets.UTF_8);

        assertThrows(IOException.class, () -> FileSuggestionCommand.setCommandIn(file, "git ls-files"));
        assertEquals("{ not json", Files.readString(file));
    }

    @Test
    public void runsTheCommandWithTheQueryOnStdinInTheProjectFolder() throws Exception {
        Assume.assumeFalse(isWindows());
        Path project = Files.createTempDirectory("file-suggestion");
        List<String> lines = FileSuggestionCommand.run(
                "cat; echo; echo \"$CLAUDE_PROJECT_DIR\"; pwd", "auth", project.toString());

        assertEquals("{\"query\":\"auth\"}", lines.get(0));
        assertEquals(project.toString(), lines.get(1));
        assertEquals(project.toFile().getCanonicalPath(), new File(lines.get(2)).getCanonicalPath());
    }

    @Test
    public void aFailingCommandIsAnError() throws Exception {
        Assume.assumeFalse(isWindows());
        Path project = Files.createTempDirectory("file-suggestion");
        assertThrows(IOException.class, () -> FileSuggestionCommand.run("exit 3", "", project.toString()));
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }
}
