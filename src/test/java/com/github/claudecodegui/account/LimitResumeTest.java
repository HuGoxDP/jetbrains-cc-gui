package com.github.claudecodegui.account;

import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class LimitResumeTest {

    /** Records what is scheduled instead of waiting for it; {@link #fire(int)} runs one now. */
    private static final class FakeScheduler extends ScheduledThreadPoolExecutor {
        final List<Runnable> commands = new ArrayList<>();
        final List<Long> delaysMs = new ArrayList<>();

        FakeScheduler() {
            super(1);
        }

        @Override
        public ScheduledFuture<?> schedule(Runnable command, long delay, TimeUnit unit) {
            commands.add(command);
            delaysMs.add(unit.toMillis(delay));
            return super.schedule(() -> { }, 1, TimeUnit.DAYS);
        }

        void fire(int index) {
            commands.get(index).run();
        }
    }

    private static final long NOW = 1_800_000_000_000L;
    private FakeScheduler scheduler;
    private final List<Long> notices = new ArrayList<>();

    @Before
    public void setUp() {
        scheduler = new FakeScheduler();
        LimitResume.useForTests(() -> NOW, scheduler);
        notices.clear();
    }

    @Test
    public void continuesAMinuteAfterTheResetOrAMinuteFromNowWhenItHasPassed() {
        assertEquals(Long.valueOf(NOW + 3_600_000L + LimitResume.GRACE_MS), LimitResume.continueAt(NOW + 3_600_000L, NOW));
        assertEquals(Long.valueOf(NOW + LimitResume.GRACE_MS), LimitResume.continueAt(NOW - 5_000L, NOW));
        assertNull(LimitResume.continueAt(null, NOW));
        assertNull(LimitResume.continueAt(0L, NOW));
    }

    @Test
    public void sendsOnceAtTheResetAndClearsTheNotice() {
        Object session = new Object();
        AtomicInteger sent = new AtomicInteger();
        Long at = LimitResume.schedule(session, NOW + 3_600_000L, sent::incrementAndGet, notices::add);

        assertEquals(Long.valueOf(NOW + 3_600_000L + LimitResume.GRACE_MS), at);
        assertEquals(Long.valueOf(3_600_000L + LimitResume.GRACE_MS), scheduler.delaysMs.get(0));
        assertEquals(at, LimitResume.pendingAt(session));

        scheduler.fire(0);
        assertEquals(1, sent.get());
        assertNull(LimitResume.pendingAt(session));
        // Shown with the time, then taken down when sent.
        assertEquals(java.util.Arrays.asList(at, null), notices);
        scheduler.fire(0);
        assertEquals(1, sent.get());
    }

    @Test
    public void aCancelledContinuationIsNeverSent() {
        Object session = new Object();
        AtomicInteger sent = new AtomicInteger();
        LimitResume.schedule(session, NOW + 60_000L, sent::incrementAndGet, notices::add);

        assertTrue(LimitResume.cancel(session));
        assertFalse(LimitResume.cancel(session));
        scheduler.fire(0);
        assertEquals(0, sent.get());
        assertNull(notices.get(notices.size() - 1));
    }

    @Test
    public void aNewLimitReplacesTheOneWaiting() {
        Object session = new Object();
        AtomicInteger first = new AtomicInteger();
        AtomicInteger second = new AtomicInteger();
        LimitResume.schedule(session, NOW + 60_000L, first::incrementAndGet, notices::add);
        Long later = LimitResume.schedule(session, NOW + 7_200_000L, second::incrementAndGet, notices::add);

        scheduler.fire(0);
        assertEquals(0, first.get());
        assertEquals(later, LimitResume.pendingAt(session));
        scheduler.fire(1);
        assertEquals(1, second.get());
    }

    @Test
    public void schedulesNothingWithoutAResetTime() {
        Object session = new Object();
        assertNull(LimitResume.schedule(session, null, () -> { }, notices::add));
        assertNull(LimitResume.pendingAt(session));
        assertTrue(scheduler.commands.isEmpty());
        assertTrue(notices.isEmpty());
    }

    @Test
    public void conversationsWaitIndependently() {
        Object a = new Object();
        Object b = new Object();
        AtomicInteger sentA = new AtomicInteger();
        AtomicInteger sentB = new AtomicInteger();
        LimitResume.schedule(a, NOW + 60_000L, sentA::incrementAndGet, notices::add);
        LimitResume.schedule(b, NOW + 60_000L, sentB::incrementAndGet, notices::add);
        LimitResume.cancel(a);
        scheduler.fire(0);
        scheduler.fire(1);
        assertEquals(0, sentA.get());
        assertEquals(1, sentB.get());
    }
}
