package com.github.claudecodegui.handler.history;

import com.github.claudecodegui.handler.core.HandlerContext;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.UUID;

/**
 * Forks a Claude conversation at one of the user's messages: a new session holding
 * everything before that message and nothing after it. The original session is only
 * read, never changed.
 *
 * <p>The CLI can fork too ({@code --resume-session-at <uuid> --fork-session}), but only
 * together with a first message, and the fork has to open empty so the user can reword
 * the message they forked from. So the new transcript is written here, as a copy of the
 * old one cut at that message (see {@link TranscriptFork}). Claude Code then resumes it
 * like any other session.
 *
 * <p>Replies to the webview through {@code window.onSessionForked} with
 * {@code {success, sessionId}} or {@code {success: false, errorCode}}.
 */
class SessionForkService {

    private static final Logger LOG = Logger.getInstance(SessionForkService.class);

    static final String INVALID_REQUEST = "INVALID_REQUEST";
    static final String SESSION_NOT_FOUND = "SESSION_NOT_FOUND";
    static final String MESSAGE_NOT_FOUND = "MESSAGE_NOT_FOUND";
    static final String NOTHING_BEFORE = "NOTHING_BEFORE";
    static final String FORK_FAILED = "FORK_FAILED";

    private final HandlerContext context;
    private final Gson gson = new Gson();

    SessionForkService(HandlerContext context) {
        this.context = context;
    }

    /**
     * @param content JSON {@code {sessionId, userMessageId}}: the session to fork and the
     *                uuid of the user message the fork stops before.
     */
    void handleForkSession(String content) {
        String sessionId = null;
        String userMessageId = null;
        try {
            JsonObject payload = this.gson.fromJson(content, JsonObject.class);
            if (payload != null) {
                sessionId = stringOrNull(payload, "sessionId");
                userMessageId = stringOrNull(payload, "userMessageId");
            }
        } catch (JsonSyntaxException e) {
            LOG.warn("[SessionForkService] Fork rejected: unreadable request");
        }

        // The session id becomes a file name, so anything but a plain id is refused.
        if (!HistoryDeleteService.isValidSessionId(sessionId)
                || userMessageId == null || userMessageId.trim().isEmpty()) {
            this.sendForkResult(null, INVALID_REQUEST);
            return;
        }

        final String sourceId = sessionId;
        final String messageId = userMessageId;
        ApplicationManager.getApplication().executeOnPooledThread(() -> this.fork(sourceId, messageId));
    }

    private void fork(String sessionId, String userMessageId) {
        Path temp = null;
        try {
            Path source = SessionConversionService.findSessionFile(
                    sessionId, this.context.resolveEffectiveWorkingDirectory());
            if (source == null) {
                this.sendForkResult(null, SESSION_NOT_FOUND);
                return;
            }

            TranscriptFork.Cut cut;
            // InputStreamReader replaces bytes that are not UTF-8 instead of failing, so
            // one bad byte in an old entry does not make the session unforkable.
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(Files.newInputStream(source), StandardCharsets.UTF_8))) {
                cut = TranscriptFork.cut(reader.lines().iterator(), userMessageId);
            }
            if (cut.outcome == TranscriptFork.Outcome.MESSAGE_NOT_FOUND) {
                this.sendForkResult(null, MESSAGE_NOT_FOUND);
                return;
            }
            if (cut.outcome == TranscriptFork.Outcome.NOTHING_BEFORE) {
                this.sendForkResult(null, NOTHING_BEFORE);
                return;
            }

            String forkedId = UUID.randomUUID().toString();
            Path directory = source.getParent();
            Path target = directory.resolve(forkedId + ".jsonl");
            // A sibling temp file renamed into place, so nothing ever reads a half-written
            // transcript. The rename is only atomic within one file system, hence the sibling.
            temp = directory.resolve("." + forkedId + ".jsonl.tmp");
            createOwnerOnly(temp);
            Files.write(temp, TranscriptFork.join(cut.lines).getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            temp = null;

            LOG.info("[SessionForkService] Forked session " + sessionId + " into " + forkedId
                    + " (" + cut.lines.size() + " lines)");
            this.sendForkResult(forkedId, null);
        } catch (Exception e) {
            LOG.warn("[SessionForkService] Fork failed: " + e.getMessage(), e);
            this.sendForkResult(null, FORK_FAILED);
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException cleanupError) {
                    LOG.warn("[SessionForkService] Failed to remove temp file: " + cleanupError.getMessage());
                }
            }
        }
    }

    /** Transcripts hold the whole conversation, so the copy is readable by its owner only. */
    private static void createOwnerOnly(Path file) throws IOException {
        if (FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            try {
                Files.createFile(file, PosixFilePermissions.asFileAttribute(
                        PosixFilePermissions.fromString("rw-------")));
                return;
            } catch (UnsupportedOperationException e) {
                // The default file system is POSIX but this one (a WSL share, say) is not.
            }
        }
        Files.createFile(file);
    }

    private static String stringOrNull(JsonObject payload, String name) {
        if (!payload.has(name) || payload.get(name).isJsonNull() || !payload.get(name).isJsonPrimitive()) {
            return null;
        }
        return payload.get(name).getAsString();
    }

    private void sendForkResult(String forkedId, String errorCode) {
        JsonObject result = new JsonObject();
        result.addProperty("success", forkedId != null);
        if (forkedId != null) {
            result.addProperty("sessionId", forkedId);
        } else {
            result.addProperty("errorCode", errorCode);
        }

        Project project = this.context.getProject();
        if (project != null && !project.isDisposed()) {
            String escapedJson = this.context.escapeJs(this.gson.toJson(result));
            String jsCode = "if (window.onSessionForked) { window.onSessionForked('" + escapedJson + "'); }";
            this.context.executeJavaScriptQueued(jsCode);
        }
    }
}
