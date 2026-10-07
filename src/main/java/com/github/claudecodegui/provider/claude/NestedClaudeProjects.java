package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.util.PathUtils;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * Projects below another one: the folders of {@code ~/.claude/projects} that hold
 * the sessions of a sub-folder of a project, such as a package in a monorepo
 * (ported from the Claude Code GUI ("Swttch") plugin's "Include nested").
 *
 * <p>A folder is named after its path with every character but letters and digits
 * turned into "-", which cannot be read back. So the name only narrows the search
 * (it starts with the project's own name and a "-"), and the real path is the
 * {@code cwd} a session in the folder recorded on its first lines.
 */
public final class NestedClaudeProjects {

    /** Lines read from a session file before giving up on finding its cwd. */
    private static final int MAX_LINES = 50;
    /** Session files tried per folder. */
    private static final int MAX_FILES = 3;

    private NestedClaudeProjects() {
    }

    /**
     * The paths of the projects strictly below {@code projectPath} that have
     * sessions, sorted. Empty when there are none or the folder cannot be read.
     */
    public static List<String> find(Path projectsDir, String projectPath) {
        List<String> found = new ArrayList<>();
        for (Folder folder : folders(projectsDir, projectPath)) {
            found.add(folder.projectPath);
        }
        return found;
    }

    /**
     * The session folders of {@code projectPath}'s nested projects. Used to find a
     * session's file when its id is all there is to go on (delete, export).
     */
    public static List<Path> sessionDirs(Path projectsDir, String projectPath) {
        List<Path> dirs = new ArrayList<>();
        for (Folder folder : folders(projectsDir, projectPath)) {
            dirs.add(folder.dir);
        }
        return dirs;
    }

    /** Whether {@code candidate} is a folder strictly inside {@code base}. */
    public static boolean isStrictlyInside(String candidate, String base) {
        if (candidate == null || base == null || candidate.isEmpty() || base.isEmpty()) {
            return false;
        }
        try {
            Path child = Paths.get(candidate).toAbsolutePath().normalize();
            Path parent = Paths.get(base).toAbsolutePath().normalize();
            return !child.equals(parent) && child.startsWith(parent);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private record Folder(Path dir, String projectPath) {
    }

    private static List<Folder> folders(Path projectsDir, String projectPath) {
        List<Folder> folders = new ArrayList<>();
        if (projectsDir == null || projectPath == null || projectPath.isEmpty() || !Files.isDirectory(projectsDir)) {
            return folders;
        }
        List<String> prefixes = new ArrayList<>();
        for (String key : PathUtils.getSanitizedPathCandidates(projectPath)) {
            prefixes.add(key + "-");
        }
        TreeSet<String> seen = new TreeSet<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectsDir)) {
            for (Path dir : stream) {
                String name = dir.getFileName().toString();
                if (!Files.isDirectory(dir) || prefixes.stream().noneMatch(name::startsWith)) {
                    continue;
                }
                String cwd = recordedCwd(dir);
                if (cwd != null && isStrictlyInside(cwd, projectPath) && seen.add(cwd)) {
                    folders.add(new Folder(dir, cwd));
                }
            }
        } catch (IOException | RuntimeException e) {
            return folders;
        }
        folders.sort((a, b) -> a.projectPath.compareTo(b.projectPath));
        return folders;
    }

    /** The cwd the first sessions of {@code dir} were started in, or null. */
    private static String recordedCwd(Path dir) {
        List<Path> files = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.jsonl")) {
            for (Path file : stream) {
                files.add(file);
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
        files.sort(null);
        for (int i = 0; i < Math.min(MAX_FILES, files.size()); i++) {
            String cwd = cwdIn(files.get(i));
            if (cwd != null) {
                return cwd;
            }
        }
        return null;
    }

    private static String cwdIn(Path file) {
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            for (int n = 0; n < MAX_LINES && (line = reader.readLine()) != null; n++) {
                if (line.isBlank()) {
                    continue;
                }
                try {
                    JsonElement element = JsonParser.parseString(line);
                    if (element.isJsonObject()) {
                        JsonObject entry = element.getAsJsonObject();
                        if (entry.has("cwd") && entry.get("cwd").isJsonPrimitive()) {
                            String cwd = entry.get("cwd").getAsString();
                            if (!cwd.isEmpty()) {
                                return cwd;
                            }
                        }
                    }
                } catch (RuntimeException ignored) {
                    // A torn or foreign line: try the next one.
                }
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
        return null;
    }
}
