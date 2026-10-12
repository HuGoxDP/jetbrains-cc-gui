package com.github.claudecodegui.account;

import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/**
 * Continuations waiting for a usage limit to reset, one per conversation (ported from
 * Swttch's auto-resume on limit reset).
 *
 * <p>When a usage limit stops a turn and no other account takes over, the chat window
 * schedules "Continue exactly where you stopped." for the moment the limit resets. The
 * wait is keyed on the session object: the user's own message, a restart, a new
 * conversation or a closed window cancels it, so nothing is sent into a conversation that
 * has moved on. Nothing is stored on disk; a pending continuation ends with the IDE.
 */
public final class LimitResume {

    /** Started a minute after the reset, so a clock a little behind the server's is not refused again. */
    public static final long GRACE_MS = TimeUnit.MINUTES.toMillis(1);

    /** Told the time a continuation will be sent, or null once it is sent or cancelled. */
    public interface Listener {
        void changed(Long atMs);
    }

    private static final class Pending {
        final ScheduledFuture<?> future;
        final long atMs;
        final Listener listener;

        Pending(ScheduledFuture<?> future, long atMs, Listener listener) {
            this.future = future;
            this.atMs = atMs;
            this.listener = listener;
        }
    }

    private static final Map<Object, Pending> PENDING = new WeakHashMap<>();

    private static ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "claude-limit-resume");
        t.setDaemon(true);
        return t;
    });
    private static LongSupplier clock = System::currentTimeMillis;

    private LimitResume() {
    }

    /**
     * When to continue for a limit that resets at {@code resetsAtMs}: a minute after it, or a
     * minute from now if that has already passed. Null when the reset time is unknown.
     */
    public static Long continueAt(Long resetsAtMs, long nowMs) {
        if (resetsAtMs == null || resetsAtMs <= 0) {
            return null;
        }
        return Math.max(resetsAtMs, nowMs) + GRACE_MS;
    }

    /**
     * Schedule {@code onFire} for a minute after {@code resetsAtMs}, replacing a continuation
     * already waiting for {@code owner}. Answers when it will run, or null (nothing scheduled)
     * when the reset time is unknown.
     */
    public static Long schedule(Object owner, Long resetsAtMs, Runnable onFire, Listener listener) {
        long now = clock.getAsLong();
        Long at = continueAt(resetsAtMs, now);
        if (owner == null || at == null) {
            return null;
        }
        cancel(owner);
        ScheduledFuture<?> future = executor.schedule(() -> {
            Pending fired;
            synchronized (PENDING) {
                fired = PENDING.get(owner);
                if (fired == null || fired.atMs != at) {
                    return;
                }
                PENDING.remove(owner);
            }
            fired.listener.changed(null);
            onFire.run();
        }, at - now, TimeUnit.MILLISECONDS);
        synchronized (PENDING) {
            PENDING.put(owner, new Pending(future, at, listener));
        }
        listener.changed(at);
        return at;
    }

    /** Cancel the continuation waiting for {@code owner}; answers whether there was one. */
    public static boolean cancel(Object owner) {
        Pending pending;
        synchronized (PENDING) {
            pending = owner == null ? null : PENDING.remove(owner);
        }
        if (pending == null) {
            return false;
        }
        pending.future.cancel(false);
        pending.listener.changed(null);
        return true;
    }

    /** When the continuation for {@code owner} will be sent, or null when none is waiting. */
    public static Long pendingAt(Object owner) {
        synchronized (PENDING) {
            Pending pending = owner == null ? null : PENDING.get(owner);
            return pending == null ? null : pending.atMs;
        }
    }

    /** What the chat's notice is told: {@code {"at": <epoch ms>}}, or {@code {"at": null}} for none. */
    public static String noticeJson(Long atMs) {
        return "{\"at\":" + (atMs == null ? "null" : String.valueOf(atMs)) + "}";
    }

    /** For tests: a fake clock and executor. */
    static void useForTests(LongSupplier testClock, ScheduledExecutorService testExecutor) {
        clock = testClock;
        executor = testExecutor;
    }
}
