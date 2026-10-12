package com.github.claudecodegui.settings;

import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Map;

/**
 * The folder Claude Code keeps its user data in: settings.json, the session
 * transcripts under {@code projects/}, skills, commands, plugins, and the
 * {@code .claude.json} beside them. A terminal user moves it with the documented
 * {@code CLAUDE_CONFIG_DIR} variable (often per project, with direnv); this is the
 * same choice made in Settings, for all projects or for one.
 *
 * <p>Which value applies to a folder, first match wins:
 * <ol>
 *   <li>the value set for the project that is that folder or contains it
 *       ({@code claudeConfigDirs} in ~/.codemoss/config.json, keyed by project path;
 *       the deepest project wins for nested ones);</li>
 *   <li>the value set for all projects ({@code claudeConfigDir});</li>
 *   <li>{@code CLAUDE_CONFIG_DIR} inherited by the IDE, for a native runtime only (a
 *       WSL distro has its own environment, which the IDE cannot see);</li>
 *   <li>{@code ~/.claude} in the home the runtime uses.</li>
 * </ol>
 *
 * <p>A value from Settings is handed to every Claude process started for that folder
 * as {@code CLAUDE_CONFIG_DIR}, and every reader of these files resolves through here,
 * so the chat and the history, skills and MCP lists cannot disagree.
 */
public final class ClaudeConfigDir {

    private static final Logger LOG = Logger.getInstance(ClaudeConfigDir.class);

    public static final String ENV_NAME = "CLAUDE_CONFIG_DIR";
    /** config.json key: the value for all projects. */
    public static final String GLOBAL_KEY = "claudeConfigDir";
    /** config.json key: project path to value. */
    public static final String PROJECTS_KEY = "claudeConfigDirs";

    /** Where the applying value came from. */
    public enum Source { PROJECT, GLOBAL, ENVIRONMENT, DEFAULT }

    /**
     * The value that applies, as written ({@code null} for the default), where it came
     * from, and for {@link Source#PROJECT} the project it is set on.
     */
    public record Resolution(String value, Source source, String project) {
        /** The value Settings chose, to hand to the CLI; null when nothing was chosen there. */
        public String chosen() {
            return source == Source.PROJECT || source == Source.GLOBAL ? value : null;
        }
    }

    private static final Object CACHE_LOCK = new Object();
    private static Path cachedFile;
    private static long cachedModified = -1;
    private static long cachedSize = -1;
    private static JsonObject cachedConfig = new JsonObject();

    private ClaudeConfigDir() {
    }

    /** Forget the cached config.json reading (after writing it: a write within the same
     * millisecond at the same size would otherwise look unchanged). */
    public static void invalidate() {
        synchronized (CACHE_LOCK) {
            cachedFile = null;
            cachedModified = -1;
            cachedSize = -1;
        }
    }

    // ==================== Resolution ====================

    /**
     * Which value applies to [path] (a project root or any folder inside one; null for
     * none), given the plugin config and the inherited environment value.
     */
    static Resolution resolve(JsonObject config, String path, String inherited, boolean ignoreCase) {
        return resolve(config, path, inherited, ignoreCase, key -> null);
    }

    /**
     * {@link #resolve(JsonObject, String, String, boolean)}, where [alternative] gives
     * another spelling of a project path to match too: with a WSL runtime the readers
     * get {@code /home/me/app} for the project the IDE calls
     * {@code //wsl.localhost/Ubuntu/home/me/app}.
     */
    static Resolution resolve(JsonObject config, String path, String inherited, boolean ignoreCase,
                              java.util.function.Function<String, String> alternative) {
        if (config != null && path != null && !path.isBlank()) {
            JsonElement projects = config.get(PROJECTS_KEY);
            if (projects != null && projects.isJsonObject()) {
                String target = normalize(path, ignoreCase);
                String bestKey = null;
                String bestValue = null;
                int bestLength = -1;
                for (Map.Entry<String, JsonElement> entry : projects.getAsJsonObject().entrySet()) {
                    String value = text(entry.getValue());
                    if (value == null) {
                        continue;
                    }
                    String other = alternative.apply(entry.getKey());
                    for (String spelling : other != null ? new String[]{entry.getKey(), other} : new String[]{entry.getKey()}) {
                        String key = normalize(spelling, ignoreCase);
                        if (key.isEmpty()) {
                            continue;
                        }
                        boolean inside = target.equals(key) || target.startsWith(key.endsWith("/") ? key : key + "/");
                        if (inside && key.length() > bestLength) {
                            bestKey = entry.getKey();
                            bestValue = value;
                            bestLength = key.length();
                        }
                    }
                }
                if (bestValue != null) {
                    return new Resolution(bestValue, Source.PROJECT, bestKey);
                }
            }
        }
        String global = config != null ? text(config.get(GLOBAL_KEY)) : null;
        if (global != null) {
            return new Resolution(global, Source.GLOBAL, null);
        }
        String env = inherited != null && !inherited.isBlank() ? inherited.trim() : null;
        if (env != null) {
            return new Resolution(env, Source.ENVIRONMENT, null);
        }
        return new Resolution(null, Source.DEFAULT, null);
    }

    /** What applies to [path] (null: no project, so the value for all projects). */
    public static Resolution resolveFor(String path) {
        return resolve(readConfig(), path, inheritedValue(), PlatformUtils.isWindows(), key -> {
            String converted = NodeDetector.convertToWslPath(key);
            return converted != null && !converted.equals(key) ? converted : null;
        });
    }

    /** The value Settings chose for [path], to hand to the CLI as CLAUDE_CONFIG_DIR, or null. */
    public static String chosenFor(String path) {
        String chosen = resolveFor(path).chosen();
        return chosen != null ? expandHome(chosen) : null;
    }

    /**
     * {@link #chosenFor} as the Node runtime must see it: a WSL runtime gets the Linux
     * form of the path (C:\x as /mnt/c/x, \\wsl.localhost\Distro\x as /x).
     */
    public static String chosenForRuntime(String path) {
        String chosen = chosenFor(path);
        if (chosen == null) {
            return null;
        }
        String nodePath = NodeDetector.getInstance().getCachedNodePath();
        boolean wsl = nodePath != null && NodeDetector.isWslPath(nodePath);
        return wsl ? NodeDetector.convertToWslPath(chosen) : chosen;
    }

    /**
     * Put the value Settings chose for [path] into a child's environment, in the form
     * [nodeExecutable] reads (and through WSLENV for a WSL runtime). Nothing chosen
     * leaves the environment as inherited.
     */
    public static void applyTo(Map<String, String> env, String path, String nodeExecutable) {
        if (env == null) {
            return;
        }
        String chosen = chosenFor(path);
        if (chosen == null) {
            return;
        }
        boolean wsl = NodeDetector.isWslPath(nodeExecutable);
        env.put(ENV_NAME, wsl ? NodeDetector.convertToWslPath(chosen) : chosen);
        if (wsl) {
            String existing = env.get("WSLENV");
            if (existing == null || existing.isEmpty()) {
                env.put("WSLENV", ENV_NAME);
            } else if (!java.util.Arrays.asList(existing.split(":")).contains(ENV_NAME)) {
                env.put("WSLENV", existing + ":" + ENV_NAME);
            }
        }
    }

    /**
     * The CLAUDE_CONFIG_DIR a daemon request for [path] runs with: the chosen value, else
     * the inherited one, else {@code ""}, which the daemon reads as "unset for this
     * request" (an empty folder would make the CLI use a relative path). The daemon
     * outlives settings changes, so each request says what applies instead of relying
     * on what the daemon was started with.
     */
    public static String daemonValue(String path) {
        String chosen = chosenForRuntime(path);
        if (chosen != null) {
            return chosen;
        }
        String inherited = inheritedValue();
        return inherited != null && !inherited.isBlank() ? inherited.trim() : "";
    }

    /** The folder itself, as the IDE reads it. */
    public static Path dir(String path) {
        Resolution resolution = resolveFor(path);
        if (resolution.value() != null) {
            return Paths.get(expandHome(resolution.value()));
        }
        return Paths.get(NodeDetector.resolveHomeForFileOps(), ".claude");
    }

    /**
     * {@link #dir}, with [home] standing in for the home directory when nothing is chosen
     * or inherited (for scanners that are handed the home they should look in).
     */
    public static Path dirIn(String home, String path) {
        Resolution resolution = resolveFor(path);
        if (resolution.value() != null) {
            return Paths.get(expandHome(resolution.value()));
        }
        return Paths.get(home, ".claude");
    }

    /** Where the session transcripts are: {@code <dir>/projects}. */
    public static Path projectsDir(String path) {
        return dir(path).resolve("projects");
    }

    /**
     * Claude Code's global config file: {@code .claude.json} inside a chosen folder, or
     * beside {@code ~/.claude} in the home when none is chosen, as the CLI places it.
     */
    public static Path globalConfigFile(String path) {
        Resolution resolution = resolveFor(path);
        if (resolution.value() != null) {
            return Paths.get(expandHome(resolution.value()), ".claude.json");
        }
        return Paths.get(NodeDetector.resolveHomeForFileOps(), ".claude.json");
    }

    // ==================== Settings values ====================

    /** The value set for all projects, or null. */
    public static String getGlobal(JsonObject config) {
        return config != null ? text(config.get(GLOBAL_KEY)) : null;
    }

    /** The value set on exactly this project, or null. */
    public static String getProject(JsonObject config, String projectPath) {
        if (config == null || projectPath == null) {
            return null;
        }
        JsonElement projects = config.get(PROJECTS_KEY);
        if (projects == null || !projects.isJsonObject()) {
            return null;
        }
        return text(projects.getAsJsonObject().get(projectPath));
    }

    /** Set (or with null/blank, clear) the value for all projects in [config]. */
    public static void setGlobal(JsonObject config, String value) {
        String trimmed = value != null ? value.trim() : "";
        if (trimmed.isEmpty()) {
            config.remove(GLOBAL_KEY);
        } else {
            config.addProperty(GLOBAL_KEY, trimmed);
        }
    }

    /** Set (or with null/blank, clear) the value for [projectPath] in [config]. */
    public static void setProject(JsonObject config, String projectPath, String value) {
        String trimmed = value != null ? value.trim() : "";
        JsonElement existing = config.get(PROJECTS_KEY);
        JsonObject projects = existing != null && existing.isJsonObject() ? existing.getAsJsonObject() : new JsonObject();
        if (trimmed.isEmpty()) {
            projects.remove(projectPath);
        } else {
            projects.addProperty(projectPath, trimmed);
        }
        if (projects.size() == 0) {
            config.remove(PROJECTS_KEY);
        } else {
            config.add(PROJECTS_KEY, projects);
        }
    }

    /**
     * Why [value] cannot be used, or null when it can: blank (which clears) is fine, and
     * anything else must be absolute once a leading {@code ~} is expanded.
     */
    public static String problemWith(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String expanded = expandHome(value.trim());
        if (!isAbsolute(expanded)) {
            return "The folder must be an absolute path (or start with ~)";
        }
        return null;
    }

    // ==================== Helpers ====================

    /** {@code ~} and {@code ~/x} in the home the runtime uses; anything else as is. */
    public static String expandHome(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.equals("~")) {
            return NodeDetector.resolveHomeForFileOps();
        }
        if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
            return Paths.get(NodeDetector.resolveHomeForFileOps(), trimmed.substring(2)).toString();
        }
        return trimmed;
    }

    static boolean isAbsolute(String path) {
        if (path.startsWith("/") || path.startsWith("\\\\")) {
            return true;
        }
        return path.length() >= 3 && Character.isLetter(path.charAt(0)) && path.charAt(1) == ':'
                && (path.charAt(2) == '\\' || path.charAt(2) == '/');
    }

    static String normalize(String path, boolean ignoreCase) {
        String normalized = path.trim().replace('\\', '/');
        while (normalized.length() > 1 && normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return ignoreCase ? normalized.toLowerCase(Locale.ROOT) : normalized;
    }

    private static String text(JsonElement element) {
        if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            return null;
        }
        String value = element.getAsString().trim();
        return value.isEmpty() ? null : value;
    }

    /** CLAUDE_CONFIG_DIR inherited by the IDE, ignored for a WSL runtime. */
    private static String inheritedValue() {
        String nodePath = NodeDetector.getInstance().getCachedNodePath();
        boolean wsl = nodePath != null && NodeDetector.isWslPath(nodePath);
        return wsl ? null : System.getenv(ENV_NAME);
    }

    /** ~/.codemoss/config.json, re-read only when the file changed. */
    private static JsonObject readConfig() {
        Path file = new ConfigPathManager().getConfigFilePath();
        synchronized (CACHE_LOCK) {
            try {
                if (!Files.isRegularFile(file)) {
                    cachedFile = file;
                    cachedModified = -1;
                    cachedSize = -1;
                    cachedConfig = new JsonObject();
                    return cachedConfig;
                }
                long modified = Files.getLastModifiedTime(file).toMillis();
                long size = Files.size(file);
                if (file.equals(cachedFile) && modified == cachedModified && size == cachedSize) {
                    return cachedConfig;
                }
                JsonElement parsed = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8));
                cachedConfig = parsed != null && parsed.isJsonObject() ? parsed.getAsJsonObject() : new JsonObject();
                cachedFile = file;
                cachedModified = modified;
                cachedSize = size;
            } catch (IOException | RuntimeException e) {
                // Keep the last good reading: a half-written file must not move Claude's folder.
                LOG.warn("[ClaudeConfigDir] Could not read " + file + ": " + e.getMessage());
            }
            return cachedConfig;
        }
    }
}
