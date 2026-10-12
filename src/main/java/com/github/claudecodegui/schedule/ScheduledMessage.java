package com.github.claudecodegui.schedule;

import java.time.Instant;
import java.time.format.DateTimeParseException;

/**
 * A "send later" reservation bound to one conversation (ported from Swttch's scheduled
 * messages). Field names follow Swttch's {@code ScheduledMessage} so both plugins describe a
 * reservation the same way; {@code provider} and {@code cwd} are CC GUI's additions, since one
 * window can hold Claude or Codex conversations from any project.
 */
public final class ScheduledMessage {

    /** The only kind CC GUI creates: a message the user scheduled. */
    public static final String KIND_USER_SCHEDULED = "USER_SCHEDULED";

    /** Reservation id, unique per reservation. */
    public String id;
    /** The conversation the message goes to. */
    public String sessionId;
    /** ISO-8601 instant at which the message is sent. */
    public String sendAt;
    /** The message, sent exactly as typed. */
    public String message;
    /** Which feature created the reservation. */
    public String kind = KIND_USER_SCHEDULED;
    /** ISO-8601 instant at which the reservation was made. */
    public String createdAt;
    /** The conversation's provider (claude, codex, ...) when it was scheduled. */
    public String provider;
    /** The conversation's working directory when it was scheduled. */
    public String cwd;

    /** {@link #sendAt} in epoch milliseconds, or null when it is not a valid instant. */
    public Long sendAtMs() {
        return parseInstantMs(sendAt);
    }

    ScheduledMessage copy() {
        ScheduledMessage c = new ScheduledMessage();
        c.id = id;
        c.sessionId = sessionId;
        c.sendAt = sendAt;
        c.message = message;
        c.kind = kind;
        c.createdAt = createdAt;
        c.provider = provider;
        c.cwd = cwd;
        return c;
    }

    /** An ISO-8601 instant in epoch milliseconds, or null. */
    public static Long parseInstantMs(String iso) {
        if (iso == null || iso.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(iso.trim()).toEpochMilli();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
