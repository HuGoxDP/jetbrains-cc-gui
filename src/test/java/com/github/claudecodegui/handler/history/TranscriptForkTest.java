package com.github.claudecodegui.handler.history;

import org.junit.Test;

import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Where a fork cuts a session transcript. The service around it only finds the file and
 * writes the result, so the decisions that matter are all here.
 */
public class TranscriptForkTest {

    private static final String SUMMARY = "{\"type\":\"summary\",\"summary\":\"Refactor\",\"leafUuid\":\"a1\"}";
    private static final String U1 = "{\"type\":\"user\",\"uuid\":\"u1\",\"parentUuid\":null,\"message\":{\"role\":\"user\",\"content\":\"first\"}}";
    private static final String A1 = "{\"type\":\"assistant\",\"uuid\":\"a1\",\"parentUuid\":\"u1\",\"message\":{\"role\":\"assistant\",\"content\":[]}}";
    private static final String SNAPSHOT = "{\"type\":\"file-history-snapshot\",\"messageId\":\"u2\",\"snapshot\":{}}";
    private static final String SYSTEM = "{\"type\":\"system\",\"uuid\":\"s1\",\"parentUuid\":\"a1\",\"content\":\"hook ran\"}";
    private static final String U2 = "{\"type\":\"user\",\"uuid\":\"u2\",\"parentUuid\":\"s1\",\"message\":{\"role\":\"user\",\"content\":\"second\"}}";
    private static final String A2 = "{\"type\":\"assistant\",\"uuid\":\"a2\",\"parentUuid\":\"u2\",\"message\":{\"role\":\"assistant\",\"content\":[]}}";

    @Test
    public void keepsEverythingBeforeTheMessageUpToTheLastReply() {
        TranscriptFork.Cut cut = TranscriptFork.cut(
                Arrays.asList(SUMMARY, U1, A1, SNAPSHOT, SYSTEM, U2, A2).iterator(), "u2");

        assertEquals(TranscriptFork.Outcome.OK, cut.outcome);
        // The snapshot and system row were written as the forked turn began; they go with it.
        assertEquals(Arrays.asList(SUMMARY, U1, A1), cut.lines);
    }

    @Test
    public void copiesLinesItCannotReadUnchanged() {
        String broken = "{not json";
        String array = "[1,2]";
        TranscriptFork.Cut cut = TranscriptFork.cut(Arrays.asList(U1, broken, array, A1, U2).iterator(), "u2");

        assertEquals(TranscriptFork.Outcome.OK, cut.outcome);
        assertEquals(Arrays.asList(U1, broken, array, A1), cut.lines);
    }

    @Test
    public void skipsBlankLines() {
        TranscriptFork.Cut cut = TranscriptFork.cut(Arrays.asList(U1, "", "   ", A1, U2).iterator(), "u2");
        assertEquals(Arrays.asList(U1, A1), cut.lines);
    }

    @Test
    public void refusesTheFirstMessageBecauseNothingComesBeforeIt() {
        TranscriptFork.Cut cut = TranscriptFork.cut(Arrays.asList(SUMMARY, SNAPSHOT, U1, A1).iterator(), "u1");

        assertEquals(TranscriptFork.Outcome.NOTHING_BEFORE, cut.outcome);
        assertTrue(cut.lines.isEmpty());
    }

    @Test
    public void reportsAMessageThatIsNotInTheTranscript() {
        TranscriptFork.Cut cut = TranscriptFork.cut(Arrays.asList(U1, A1, U2, A2).iterator(), "missing");

        assertEquals(TranscriptFork.Outcome.MESSAGE_NOT_FOUND, cut.outcome);
        assertTrue(cut.lines.isEmpty());
    }

    @Test
    public void ignoresAUuidThatIsNotAString() {
        String numeric = "{\"type\":\"user\",\"uuid\":42}";
        TranscriptFork.Cut cut = TranscriptFork.cut(Arrays.asList(U1, A1, numeric, U2).iterator(), "42");
        assertEquals(TranscriptFork.Outcome.MESSAGE_NOT_FOUND, cut.outcome);
    }

    @Test
    public void stopsReadingAtTheCut() {
        List<String> lines = Arrays.asList(U1, A1, U2, A2);
        int[] read = {0};
        Iterator<String> counting = new Iterator<String>() {
            private final Iterator<String> inner = lines.iterator();

            @Override
            public boolean hasNext() {
                return inner.hasNext();
            }

            @Override
            public String next() {
                read[0]++;
                return inner.next();
            }
        };

        TranscriptFork.cut(counting, "u2");
        assertEquals("the line after the cut is never read", 3, read[0]);
    }

    @Test
    public void joinsWithATrailingNewline() {
        assertEquals(U1 + "\n" + A1 + "\n", TranscriptFork.join(Arrays.asList(U1, A1)));
    }
}
