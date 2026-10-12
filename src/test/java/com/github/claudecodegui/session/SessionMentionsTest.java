package com.github.claudecodegui.session;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

public class SessionMentionsTest {

    private static JsonObject mention(String name, String body) {
        JsonObject m = new JsonObject();
        m.addProperty("name", name);
        m.addProperty("body", body);
        return m;
    }

    @Test
    public void asksTheModelToDeliverTheWordsToTheNamedSession() {
        String prompt = "@@release-notes-3 what did you verify?";
        String sent = SessionMentions.withReminder(prompt, mention("release-notes-3", "  what did you verify?  "));

        assertTrue(sent.startsWith(prompt + "\n<system-reminder>"));
        assertTrue(sent.contains("named release-notes-3, through the composer's @@ mention"));
        assertTrue(sent.contains("SendMessage tool (to: 'release-notes-3')"));
        assertTrue(sent.contains("\n---\nwhat did you verify?\n---\n"));
        assertTrue(sent.endsWith("</system-reminder>"));
    }

    @Test
    public void theChatShowsOnlyWhatTheUserWrote() {
        String prompt = "@@a-1 hello\nsecond line";
        String sent = SessionMentions.withReminder(prompt, mention("a-1", "hello\nsecond line"));
        assertEquals(prompt, SessionMentions.withoutReminder(sent));
        // Other system reminders, and text without one, are left alone.
        String other = "hi\n<system-reminder>something else</system-reminder>";
        assertSame(other, SessionMentions.withoutReminder(other));
        assertEquals("plain", SessionMentions.withoutReminder("plain"));
    }

    @Test
    public void leavesThePromptAloneWithoutAUsableMention() {
        String prompt = "hello";
        assertSame(prompt, SessionMentions.withReminder(prompt, null));
        assertSame(prompt, SessionMentions.withReminder(prompt, JsonParser.parseString("\"x\"")));
        assertSame(prompt, SessionMentions.withReminder(prompt, mention("bad name", "hi")));
        assertSame(prompt, SessionMentions.withReminder(prompt, mention("a'; rm", "hi")));
        assertSame(prompt, SessionMentions.withReminder(prompt, mention("a-1", "   ")));
        assertSame(prompt, SessionMentions.withReminder(prompt, new JsonObject()));
    }
}
