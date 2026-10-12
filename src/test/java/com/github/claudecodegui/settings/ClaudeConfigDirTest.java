package com.github.claudecodegui.settings;

import com.google.gson.JsonObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ClaudeConfigDirTest {

    private static JsonObject config(String global, String... projectAndValue) {
        JsonObject config = new JsonObject();
        if (global != null) {
            ClaudeConfigDir.setGlobal(config, global);
        }
        for (int i = 0; i + 1 < projectAndValue.length; i += 2) {
            ClaudeConfigDir.setProject(config, projectAndValue[i], projectAndValue[i + 1]);
        }
        return config;
    }

    @Test
    public void projectValueWinsInsideItsProject() {
        JsonObject config = config("/claude/all", "/work/app", "/claude/app");

        ClaudeConfigDir.Resolution root = ClaudeConfigDir.resolve(config, "/work/app", null, false);
        assertEquals("/claude/app", root.value());
        assertEquals(ClaudeConfigDir.Source.PROJECT, root.source());
        assertEquals("/work/app", root.project());
        assertEquals("/claude/app", root.chosen());

        // A working directory inside the project gets the project's value too.
        assertEquals("/claude/app", ClaudeConfigDir.resolve(config, "/work/app/packages/web", null, false).value());
    }

    @Test
    public void aSiblingWithTheSamePrefixIsNotInside() {
        JsonObject config = config(null, "/work/app", "/claude/app");
        ClaudeConfigDir.Resolution sibling = ClaudeConfigDir.resolve(config, "/work/app-two", null, false);
        assertEquals(ClaudeConfigDir.Source.DEFAULT, sibling.source());
        assertNull(sibling.value());
    }

    @Test
    public void theDeepestProjectWins() {
        JsonObject config = config(null, "/work", "/claude/outer", "/work/app", "/claude/inner");
        assertEquals("/claude/inner", ClaudeConfigDir.resolve(config, "/work/app/src", null, false).value());
        assertEquals("/claude/outer", ClaudeConfigDir.resolve(config, "/work/other", null, false).value());
    }

    @Test
    public void fallsBackToGlobalThenInheritedThenDefault() {
        assertEquals(ClaudeConfigDir.Source.GLOBAL,
                ClaudeConfigDir.resolve(config("/claude/all"), "/work/app", "/env/claude", false).source());

        ClaudeConfigDir.Resolution inherited = ClaudeConfigDir.resolve(config(null), "/work/app", " /env/claude ", false);
        assertEquals(ClaudeConfigDir.Source.ENVIRONMENT, inherited.source());
        assertEquals("/env/claude", inherited.value());
        // Inherited is not a choice made in Settings: nothing to hand the CLI.
        assertNull(inherited.chosen());

        ClaudeConfigDir.Resolution none = ClaudeConfigDir.resolve(config(null), "/work/app", "  ", false);
        assertEquals(ClaudeConfigDir.Source.DEFAULT, none.source());
        assertNull(none.chosen());
    }

    @Test
    public void noPathMeansTheValueForAllProjects() {
        JsonObject config = config("/claude/all", "/work/app", "/claude/app");
        assertEquals("/claude/all", ClaudeConfigDir.resolve(config, null, null, false).value());
    }

    @Test
    public void windowsPathsMatchWhateverTheirSlashesAndCase() {
        JsonObject config = config(null, "C:/Users/me/app", "D:\\claude\\app");
        assertEquals("D:\\claude\\app",
                ClaudeConfigDir.resolve(config, "c:\\users\\ME\\app\\src", null, true).value());
        assertEquals(ClaudeConfigDir.Source.DEFAULT,
                ClaudeConfigDir.resolve(config, "c:\\users\\ME\\app\\src", null, false).source());
    }

    @Test
    public void aWslSpellingOfTheProjectMatches() {
        JsonObject config = config(null, "//wsl.localhost/Ubuntu/home/me/app", "/home/me/claude-app");
        ClaudeConfigDir.Resolution resolution = ClaudeConfigDir.resolve(config, "/home/me/app", null, false,
                key -> key.startsWith("//wsl.localhost/Ubuntu") ? key.substring("//wsl.localhost/Ubuntu".length()) : null);
        assertEquals("/home/me/claude-app", resolution.value());
        assertEquals("//wsl.localhost/Ubuntu/home/me/app", resolution.project());
    }

    @Test
    public void blankValuesClearAndTheProjectsMapGoesAwayWhenEmpty() {
        JsonObject config = config("/claude/all", "/work/app", "/claude/app");
        ClaudeConfigDir.setGlobal(config, "  ");
        ClaudeConfigDir.setProject(config, "/work/app", "");
        assertFalse(config.has(ClaudeConfigDir.GLOBAL_KEY));
        assertFalse(config.has(ClaudeConfigDir.PROJECTS_KEY));
    }

    @Test
    public void readsBackTheValuesItWrote() {
        JsonObject config = config(" /claude/all ", "/work/app", "/claude/app");
        assertEquals("/claude/all", ClaudeConfigDir.getGlobal(config));
        assertEquals("/claude/app", ClaudeConfigDir.getProject(config, "/work/app"));
        assertNull(ClaudeConfigDir.getProject(config, "/work/other"));
    }

    @Test
    public void ignoresValuesThatAreNotText() {
        JsonObject config = new JsonObject();
        config.addProperty(ClaudeConfigDir.GLOBAL_KEY, 42);
        JsonObject projects = new JsonObject();
        projects.add("/work/app", new JsonObject());
        config.add(ClaudeConfigDir.PROJECTS_KEY, projects);
        assertEquals(ClaudeConfigDir.Source.DEFAULT, ClaudeConfigDir.resolve(config, "/work/app", null, false).source());
    }

    @Test
    public void onlyAbsoluteFoldersAreAccepted() {
        assertNull(ClaudeConfigDir.problemWith(""));
        assertNull(ClaudeConfigDir.problemWith("/home/me/claude-work"));
        assertNull(ClaudeConfigDir.problemWith("C:\\claude"));
        assertNull(ClaudeConfigDir.problemWith("\\\\server\\share\\claude"));
        assertNotNull(ClaudeConfigDir.problemWith("claude-work"));
        assertNotNull(ClaudeConfigDir.problemWith("./claude"));
    }

    @Test
    public void absolutePathsOnEveryPlatform() {
        assertTrue(ClaudeConfigDir.isAbsolute("/x"));
        assertTrue(ClaudeConfigDir.isAbsolute("C:/x"));
        assertTrue(ClaudeConfigDir.isAbsolute("c:\\x"));
        assertFalse(ClaudeConfigDir.isAbsolute("C:x"));
        assertFalse(ClaudeConfigDir.isAbsolute("x/y"));
    }
}
