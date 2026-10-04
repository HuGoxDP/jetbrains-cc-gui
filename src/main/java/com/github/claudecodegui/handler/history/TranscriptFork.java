package com.github.claudecodegui.handler.history;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonParseException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/**
 * Decides which lines of a Claude session transcript a fork keeps.
 *
 * <p>A fork is a line-for-line copy of the transcript up to (not including) the user
 * message it was taken from, so Claude Code resumes it like any other session. The CLI's
 * own fork copies entries the same way, uuids and all. Only two fields of an entry are
 * read, to find where to cut: {@code uuid} and {@code type}. Every line before the cut,
 * including ones this code does not understand, is copied unchanged.
 *
 * <p>Kept separate from {@link SessionForkService} so the cut can be tested without the
 * IDE.
 */
final class TranscriptFork {

    enum Outcome {
        /** {@link Cut#lines} is the transcript of the fork. */
        OK,
        /** No entry has the requested uuid. */
        MESSAGE_NOT_FOUND,
        /** The message opens the conversation, so there is nothing to fork. */
        NOTHING_BEFORE
    }

    static final class Cut {
        final Outcome outcome;
        final List<String> lines;

        private Cut(Outcome outcome, List<String> lines) {
            this.outcome = outcome;
            this.lines = lines;
        }
    }

    private TranscriptFork() {
    }

    /**
     * Read lines until the entry whose uuid is {@code userMessageId} and keep what came
     * before it, up to the last user or assistant entry.
     *
     * <p>Lines after that last message (snapshots, system rows written as the next turn
     * started) belong to the message being forked from, so they are dropped with it.
     * The iterator is read only as far as the cut, so a long transcript is not loaded
     * past the point that matters.
     */
    static Cut cut(Iterator<String> lines, String userMessageId) {
        List<String> kept = new ArrayList<>();
        int lastMessageIndex = -1;
        boolean found = false;

        while (lines.hasNext()) {
            String line = lines.next();
            if (line == null || line.trim().isEmpty()) {
                continue;
            }
            JsonObject entry = parseObject(line);
            if (entry == null) {
                kept.add(line);
                continue;
            }
            String uuid = stringField(entry, "uuid");
            if (userMessageId.equals(uuid)) {
                found = true;
                break;
            }
            kept.add(line);
            String type = stringField(entry, "type");
            if (uuid != null && ("user".equals(type) || "assistant".equals(type))) {
                lastMessageIndex = kept.size() - 1;
            }
        }

        if (!found) {
            return new Cut(Outcome.MESSAGE_NOT_FOUND, Collections.emptyList());
        }
        if (lastMessageIndex < 0) {
            return new Cut(Outcome.NOTHING_BEFORE, Collections.emptyList());
        }
        return new Cut(Outcome.OK, new ArrayList<>(kept.subList(0, lastMessageIndex + 1)));
    }

    /** The transcript text of a fork: one entry per line, ending in a newline like the CLI's. */
    static String join(List<String> lines) {
        return String.join("\n", lines) + "\n";
    }

    private static JsonObject parseObject(String line) {
        try {
            JsonElement element = JsonParser.parseString(line);
            return element != null && element.isJsonObject() ? element.getAsJsonObject() : null;
        } catch (JsonParseException | IllegalStateException e) {
            return null;
        }
    }

    private static String stringField(JsonObject entry, String name) {
        JsonElement value = entry.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            return null;
        }
        return value.getAsString();
    }
}
