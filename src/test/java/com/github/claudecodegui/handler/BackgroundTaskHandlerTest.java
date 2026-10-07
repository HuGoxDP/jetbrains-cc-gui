package com.github.claudecodegui.handler;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * Tests for {@link BackgroundTaskHandler} request parsing: a stop request names
 * the task by its tool call, with the agent id as the fallback the daemon uses
 * for a task it never saw start.
 */
public class BackgroundTaskHandlerTest {

    @Test
    public void readsTheToolCallAndTheAgentId() {
        String[] result = BackgroundTaskHandler.parseStopRequest("{\"toolUseId\":\"toolu_1\",\"agentId\":\"a1b2c3d\"}");

        assertEquals("toolu_1", result[0]);
        assertEquals("a1b2c3d", result[1]);
    }

    @Test
    public void theAgentIdIsOptional() {
        String[] result = BackgroundTaskHandler.parseStopRequest("{\"toolUseId\":\"toolu_1\"}");

        assertEquals("toolu_1", result[0]);
        assertNull(result[1]);
    }

    @Test
    public void blankNullAndNonTextValuesAreMissing() {
        String[] result = BackgroundTaskHandler.parseStopRequest("{\"toolUseId\":\"  \",\"agentId\":null}");
        assertNull(result[0]);
        assertNull(result[1]);

        result = BackgroundTaskHandler.parseStopRequest("{\"toolUseId\":{\"x\":1},\"agentId\":[1]}");
        assertNull(result[0]);
        assertNull(result[1]);
    }

    @Test
    public void unreadableContentGivesNothing() {
        assertNull(BackgroundTaskHandler.parseStopRequest(null)[0]);
        assertNull(BackgroundTaskHandler.parseStopRequest("")[0]);
        assertNull(BackgroundTaskHandler.parseStopRequest("not json {{")[0]);
        assertNull(BackgroundTaskHandler.parseStopRequest("[1,2]")[0]);
    }
}
