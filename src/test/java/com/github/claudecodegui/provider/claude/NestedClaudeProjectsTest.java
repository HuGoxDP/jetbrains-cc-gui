package com.github.claudecodegui.provider.claude;

import com.github.claudecodegui.util.PathUtils;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Finding the projects nested below a project from the folders the CLI keeps their
 * sessions in, whose names cannot be read back into paths.
 */
public class NestedClaudeProjectsTest {

    @Rule
    public final TemporaryFolder tmp = new TemporaryFolder();

    /** A session folder for {@code cwd}, named as the CLI names it, holding one session. */
    private Path sessionFolder(Path projectsDir, String cwd, String firstLines) throws IOException {
        Path dir = projectsDir.resolve(PathUtils.sanitizePath(cwd));
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("aaaaaaaa-1111-4111-8111-111111111111.jsonl"), firstLines, StandardCharsets.UTF_8);
        return dir;
    }

    private static String cwdLine(String cwd) {
        return "{\"type\":\"user\",\"cwd\":\"" + cwd + "\",\"sessionId\":\"aaaaaaaa-1111-4111-8111-111111111111\"}\n";
    }

    @Test
    public void findsTheProjectsBelow_byTheCwdTheirSessionsRecorded() throws IOException {
        Path projectsDir = tmp.newFolder("projects").toPath();
        String root = tmp.getRoot().toPath().resolve("repo").toString();
        String api = root + "/packages/api";
        String web = root + "/packages/web";
        sessionFolder(projectsDir, root, cwdLine(root));
        sessionFolder(projectsDir, api, cwdLine(api));
        sessionFolder(projectsDir, web, "{\"type\":\"summary\"}\n" + cwdLine(web));

        assertEquals(List.of(api, web), NestedClaudeProjects.find(projectsDir, root));
    }

    @Test
    public void leavesOutASiblingWhoseNameOnlyLooksNested() throws IOException {
        // "repo-old" sanitizes to the same prefix as "repo/old": only the recorded cwd tells them apart.
        Path projectsDir = tmp.newFolder("projects").toPath();
        String root = tmp.getRoot().toPath().resolve("repo").toString();
        String sibling = tmp.getRoot().toPath().resolve("repo-old").toString();
        sessionFolder(projectsDir, sibling, cwdLine(sibling));

        assertTrue(NestedClaudeProjects.find(projectsDir, root).isEmpty());
    }

    @Test
    public void leavesOutTheProjectItself_andFoldersWithNoCwd() throws IOException {
        Path projectsDir = tmp.newFolder("projects").toPath();
        String root = tmp.getRoot().toPath().resolve("repo").toString();
        sessionFolder(projectsDir, root, cwdLine(root));
        sessionFolder(projectsDir, root + "/docs", "not json\n{\"type\":\"summary\"}\n");

        assertTrue(NestedClaudeProjects.find(projectsDir, root).isEmpty());
    }

    @Test
    public void givesTheSessionFoldersForLookingASessionUp() throws IOException {
        Path projectsDir = tmp.newFolder("projects").toPath();
        String root = tmp.getRoot().toPath().resolve("repo").toString();
        String api = root + "/packages/api";
        Path apiDir = sessionFolder(projectsDir, api, cwdLine(api));

        assertEquals(List.of(apiDir), NestedClaudeProjects.sessionDirs(projectsDir, root));
    }

    @Test
    public void answersEmptyForAMissingProjectsFolder() {
        Path missing = tmp.getRoot().toPath().resolve("nowhere");
        assertTrue(NestedClaudeProjects.find(missing, "/repo").isEmpty());
        assertTrue(NestedClaudeProjects.find(null, "/repo").isEmpty());
    }

    @Test
    public void isStrictlyInside_takesOnlyAFolderBelow() {
        assertTrue(NestedClaudeProjects.isStrictlyInside("/repo/packages/api", "/repo"));
        assertTrue(NestedClaudeProjects.isStrictlyInside("/repo/packages/../api", "/repo"));
        assertFalse(NestedClaudeProjects.isStrictlyInside("/repo", "/repo"));
        assertFalse(NestedClaudeProjects.isStrictlyInside("/repo-old", "/repo"));
        assertFalse(NestedClaudeProjects.isStrictlyInside("/repo/../etc", "/repo"));
        assertFalse(NestedClaudeProjects.isStrictlyInside(null, "/repo"));
        assertFalse(NestedClaudeProjects.isStrictlyInside("", "/repo"));
    }
}
