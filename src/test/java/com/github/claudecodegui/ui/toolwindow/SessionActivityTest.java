package com.github.claudecodegui.ui.toolwindow;

import com.github.claudecodegui.ui.ChatWindowDelegate.TabAnswerStatus;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;

/**
 * Tests for {@link SessionActivity}: the activity each open tab stands for, and
 * what the history list receives when one session is open in two tabs.
 */
public class SessionActivityTest {

    @Test
    public void eachTabStatusStandsForOneActivity() {
        assertEquals("running", SessionActivity.stateOf(TabAnswerStatus.ANSWERING));
        assertEquals("awaiting", SessionActivity.stateOf(TabAnswerStatus.WAITING));
        assertEquals("done", SessionActivity.stateOf(TabAnswerStatus.COMPLETED));
        assertEquals("open", SessionActivity.stateOf(TabAnswerStatus.IDLE));
        assertEquals("open", SessionActivity.stateOf(null));
    }

    @Test
    public void theStateThatAsksMoreOfTheUserWins() {
        assertEquals("awaiting", SessionActivity.stronger("running", "awaiting"));
        assertEquals("running", SessionActivity.stronger("running", "done"));
        assertEquals("done", SessionActivity.stronger("open", "done"));
        assertEquals("open", SessionActivity.stronger("open", "open"));
    }

    @Test
    public void snapshotListsOpenSessionsAndSkipsTabsWithoutOne() {
        Map<String, TabAnswerStatus> statuses = new LinkedHashMap<>();
        statuses.put("s1", TabAnswerStatus.ANSWERING);
        statuses.put("s2", TabAnswerStatus.IDLE);
        statuses.put("", TabAnswerStatus.WAITING);

        assertEquals("{\"s1\":\"running\",\"s2\":\"open\"}", SessionActivity.snapshotJson(statuses));
    }
}
