package com.github.claudecodegui.schedule;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ScheduledMessagesTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final AtomicLong now = new AtomicLong(Instant.parse("2026-10-12T09:00:00Z").toEpochMilli());
    private Path file;
    private ScheduledMessages store;

    @Before
    public void setUp() {
        file = tmp.getRoot().toPath().resolve("scheduled-messages.json");
        store = new ScheduledMessages(file, now::get);
    }

    private static String at(String time) {
        return "2026-10-12T" + time + "Z";
    }

    @Test
    public void listsAConversationsReservationsSoonestFirst() throws Exception {
        store.create("s1", at("11:00:00"), "second", "claude", "/p");
        store.create("s1", at("10:00:00"), "first", "claude", "/p");
        store.create("s2", at("09:30:00"), "other", "claude", "/p");

        List<ScheduledMessage> list = store.forSession("s1");
        assertEquals(2, list.size());
        assertEquals("first", list.get(0).message);
        assertEquals("second", list.get(1).message);
        assertEquals("USER_SCHEDULED", list.get(0).kind);
        assertEquals(at("09:00:00"), list.get(0).createdAt);
    }

    @Test
    public void keepsReservationsAcrossRestarts() throws Exception {
        ScheduledMessage m = store.create("s1", "2026-10-12T12:30:00.000Z", "hello\nthere", "codex", "/p");

        ScheduledMessages reopened = new ScheduledMessages(file, now::get);
        List<ScheduledMessage> list = reopened.forSession("s1");
        assertEquals(1, list.size());
        assertEquals(m.id, list.get(0).id);
        assertEquals("hello\nthere", list.get(0).message);
        assertEquals(at("12:30:00"), list.get(0).sendAt);
        assertEquals("codex", list.get(0).provider);
    }

    @Test
    public void refusesWhatCannotBeSent() throws Exception {
        assertRefused("session_required", () -> store.create(" ", at("10:00:00"), "x", null, null));
        assertRefused("time_invalid", () -> store.create("s1", "tomorrow", "x", null, null));
        assertRefused("message_required", () -> store.create("s1", at("10:00:00"), "  \n", null, null));
        assertRefused("message_too_long",
                () -> store.create("s1", at("10:00:00"), "x".repeat(ScheduledMessages.MAX_MESSAGE_CHARS + 1), null, null));
        assertRefused("not_found", () -> store.update("missing", at("10:00:00"), "x"));
        assertTrue(store.forSession("s1").isEmpty());
        assertFalse(Files.exists(file));
    }

    @Test
    public void handsEachDueReservationOverOnce() throws Exception {
        List<String> handed = new ArrayList<>();
        store.useDeliverer(m -> handed.add(m.message));
        ScheduledMessage first = store.create("s1", at("09:00:30"), "soon", null, null);
        store.create("s1", at("10:00:00"), "later", null, null);

        store.tick();
        assertTrue(handed.isEmpty());

        now.set(Instant.parse(at("09:00:30")).toEpochMilli());
        store.tick();
        store.tick();
        assertEquals(List.of("soon"), handed);

        // Not sent yet: still listed, and still due for a tab that shows the conversation.
        assertEquals(1, store.dueFor("s1").size());
        assertEquals(first.id, store.dueFor("s1").get(0).id);

        assertEquals("s1", store.delivered(first.id));
        assertTrue(store.dueFor("s1").isEmpty());
        assertEquals(1, store.forSession("s1").size());
    }

    @Test
    public void anEditedTimeIsHandedOverAgain() throws Exception {
        List<String> handed = new ArrayList<>();
        store.useDeliverer(m -> handed.add(m.message));
        ScheduledMessage m = store.create("s1", at("09:00:00"), "one", null, null);
        store.tick();
        assertEquals(List.of("one"), handed);

        store.update(m.id, at("09:05:00"), "two");
        store.tick();
        assertEquals(List.of("one"), handed);

        now.set(Instant.parse(at("09:05:00")).toEpochMilli());
        store.tick();
        assertEquals(List.of("one", "two"), handed);
    }

    @Test
    public void onlyOneTabTakesADueReservationAtATime() throws Exception {
        Object tabA = new Object();
        Object tabB = new Object();
        ScheduledMessage m = store.create("s1", at("09:00:00"), "x", null, null);
        assertTrue(store.claim(m.id, tabA));
        assertFalse(store.claim(m.id, tabB));
        // The tab that has it may ask again (it was handed it before it knew its conversation).
        assertTrue(store.claim(m.id, tabA));

        now.addAndGet(ScheduledMessages.CLAIM_MS);
        assertTrue(store.claim(m.id, tabB));
        assertFalse(store.claim(m.id, tabA));

        store.remove(m.id);
        assertFalse(store.claim(m.id, tabA));
        assertFalse(store.claim(null, tabA));
        assertFalse(store.claim(m.id, null));
    }

    @Test
    public void deletingAConversationDropsItsReservations() throws Exception {
        store.create("s1", at("10:00:00"), "a", null, null);
        store.create("s1", at("11:00:00"), "b", null, null);
        store.create("s2", at("10:00:00"), "c", null, null);

        assertEquals(2, store.removeSession("s1"));
        assertTrue(store.forSession("s1").isEmpty());
        assertEquals(1, new ScheduledMessages(file, now::get).forSession("s2").size());
        assertNull(store.remove("nothing"));
    }

    @Test
    public void skipsAnUnreadableFile() throws Exception {
        Files.writeString(file, "{not json");
        assertTrue(store.forSession("s1").isEmpty());
        store.create("s1", at("10:00:00"), "a", null, null);
        assertEquals(1, new ScheduledMessages(file, now::get).forSession("s1").size());
    }

    private interface Action {
        void run() throws Exception;
    }

    private static void assertRefused(String code, Action action) throws Exception {
        try {
            action.run();
            fail("expected " + code);
        } catch (ScheduledMessages.Refused e) {
            assertEquals(code, e.code);
        }
    }
}
