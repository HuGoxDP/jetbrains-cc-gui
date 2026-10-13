package com.github.claudecodegui.handler.file;

import com.github.claudecodegui.settings.ClaudeConfigDir;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Claude Code's {@code fileSuggestion} setting (ported from Swttch): a command of the user's
 * own that builds the {@code @} file list, set in settings.json as
 * {@code "fileSuggestion": {"type": "command", "command": "<shell command>"}}.
 *
 * <p>As in the CLI, the command runs in a shell in the project folder with
 * {@code CLAUDE_PROJECT_DIR} set, gets {@code {"query": "<text>"}} on stdin, and prints one
 * path per line; the first 15 are used. Any failure leaves the built-in list in place.
 */
final class FileSuggestionCommand {

    private static final Logger LOG = Logger.getInstance(FileSuggestionCommand.class);

    /** The CLI uses at most this many of the command's lines. */
    static final int RESULT_CAP = 15;
    private static final long TIMEOUT_SECONDS = 5;

    private FileSuggestionCommand() {
    }

    /**
     * The command the settings for {@code projectPath} set, or null. The local project
     * file wins over the shared project file, which wins over the user's settings (in the
     * folder Claude Code uses for this project).
     */
    static String commandFor(String projectPath) {
        String command = commandIn(userSettingsFile(projectPath));
        String projectCommand = projectCommand(projectPath);
        return projectCommand != null ? projectCommand : command;
    }

    /** The user's settings file Claude Code reads for {@code projectPath}. */
    static Path userSettingsFile(String projectPath) {
        return ClaudeConfigDir.dir(projectPath).resolve("settings.json");
    }

    /** The command the user's settings set (what Settings edits), or null. */
    static String userCommand(String projectPath) {
        return commandIn(userSettingsFile(projectPath));
    }

    /** The project's own setting (.claude/settings.local.json, then .claude/settings.json), or null. */
    static String projectCommand(String projectPath) {
        String local = projectSettingWith(projectPath);
        return local != null ? commandIn(Path.of(projectPath, ".claude", local)) : null;
    }

    /** Which of the project's settings files sets the command (the one that wins), or null. */
    static String projectSettingWith(String projectPath) {
        if (projectPath == null || projectPath.isEmpty()) {
            return null;
        }
        for (String name : new String[] {"settings.local.json", "settings.json"}) {
            if (commandIn(Path.of(projectPath, ".claude", name)) != null) {
                return name;
            }
        }
        return null;
    }

    /**
     * Set the command in the user's settings, or remove the setting when {@code command} is
     * blank. Only that key changes; a settings file that cannot be read is left alone and
     * the call fails.
     */
    static void setUserCommand(String projectPath, String command) throws IOException {
        setCommandIn(userSettingsFile(projectPath), command);
    }

    /** {@link #setUserCommand} on a given settings file. */
    static void setCommandIn(Path file, String command) throws IOException {
        JsonObject settings;
        if (Files.isRegularFile(file)) {
            String raw = Files.readString(file, StandardCharsets.UTF_8);
            JsonElement parsed;
            try {
                parsed = raw.isBlank() ? new JsonObject() : JsonParser.parseString(raw);
            } catch (Exception e) {
                throw new IOException(file + " could not be read; left unchanged", e);
            }
            if (!parsed.isJsonObject()) {
                throw new IOException(file + " is not a JSON object; left unchanged");
            }
            settings = parsed.getAsJsonObject();
        } else {
            Files.createDirectories(file.getParent());
            settings = new JsonObject();
        }
        if (command == null || command.isBlank()) {
            settings.remove("fileSuggestion");
        } else {
            JsonObject config = new JsonObject();
            config.addProperty("type", "command");
            config.addProperty("command", command.trim());
            settings.add("fileSuggestion", config);
        }
        Files.writeString(file, new GsonBuilder().setPrettyPrinting().create().toJson(settings),
                StandardCharsets.UTF_8);
        try {
            // settings.json may hold credentials.
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException | IOException ignored) {
            // Not a POSIX file system.
        }
    }

    static String commandIn(Path settingsFile) {
        if (!Files.isRegularFile(settingsFile)) {
            return null;
        }
        try {
            JsonElement parsed = JsonParser.parseString(Files.readString(settingsFile, StandardCharsets.UTF_8));
            return parsed.isJsonObject() ? parse(parsed.getAsJsonObject()) : null;
        } catch (Exception e) {
            LOG.debug("[FileSuggestion] Unreadable " + settingsFile + ": " + e.getMessage());
            return null;
        }
    }

    /** The command of a settings object's {@code fileSuggestion}, or null. */
    static String parse(JsonObject settings) {
        JsonElement raw = settings.get("fileSuggestion");
        if (raw == null || !raw.isJsonObject()) {
            return null;
        }
        JsonObject config = raw.getAsJsonObject();
        JsonElement type = config.get("type");
        JsonElement command = config.get("command");
        if (type == null || !type.isJsonPrimitive() || !"command".equals(type.getAsString())) {
            return null;
        }
        if (command == null || !command.isJsonPrimitive() || command.getAsString().isBlank()) {
            return null;
        }
        return command.getAsString();
    }

    /** The lines the command prints for {@code query}, trimmed, empty ones dropped, at most 15. */
    static List<String> run(String command, String query, String projectPath) throws IOException, InterruptedException {
        List<String> shell = shell();
        if (shell == null) {
            throw new IOException("no shell to run the fileSuggestion command");
        }
        List<String> argv = new ArrayList<>(shell);
        argv.add(command);
        ProcessBuilder builder = new ProcessBuilder(argv);
        File dir = new File(projectPath);
        if (dir.isDirectory()) {
            builder.directory(dir);
        }
        builder.environment().put("CLAUDE_PROJECT_DIR", projectPath);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        File out = File.createTempFile("file-suggestion", ".txt");
        try {
            builder.redirectOutput(out);
            Process process = builder.start();
            JsonObject input = new JsonObject();
            input.addProperty("query", query != null ? query : "");
            try (OutputStream stdin = process.getOutputStream()) {
                stdin.write(input.toString().getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) {
                // A command that does not read its input may close it first.
            }
            if (!process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IOException("fileSuggestion command timed out");
            }
            if (process.exitValue() != 0) {
                throw new IOException("fileSuggestion command exited with " + process.exitValue());
            }
            return lines(Files.readString(out.toPath(), StandardCharsets.UTF_8));
        } finally {
            Files.deleteIfExists(out.toPath());
        }
    }

    static List<String> lines(String stdout) {
        List<String> result = new ArrayList<>();
        for (String line : stdout.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
                if (result.size() == RESULT_CAP) {
                    break;
                }
            }
        }
        return result;
    }

    /** bash (Git Bash on Windows) as the CLI uses, or sh; null when there is none. */
    private static List<String> shell() {
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            String bash = gitBashOnWindows();
            return bash != null ? List.of(bash, "-c") : null;
        }
        return List.of(new File("/bin/bash").exists() ? "/bin/bash" : "/bin/sh", "-c");
    }

    /** Git for Windows keeps bash next to git: {@code <root>\cmd\git.exe} → {@code <root>\bin\bash.exe}. */
    private static String gitBashOnWindows() {
        String path = System.getenv("PATH");
        if (path == null) {
            return null;
        }
        for (String entry : path.split(File.pathSeparator)) {
            File git = new File(entry, "git.exe");
            if (!git.isFile()) {
                continue;
            }
            File root = git.getParentFile().getParentFile();
            if (root == null) {
                continue;
            }
            for (String candidate : new String[] {"bin\\bash.exe", "usr\\bin\\bash.exe"}) {
                File bash = new File(root, candidate);
                if (bash.isFile()) {
                    return bash.getAbsolutePath();
                }
            }
        }
        return null;
    }
}
