package com.github.claudecodegui.schedule;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/**
 * The scheduled messages ("send later"), kept in one file and checked once a second.
 *
 * <p>A reservation stays until the chat that sent it says so ({@link #delivered}): when it
 * comes due, {@link #tick} hands it to the deliverer once; a chat tab that later shows the
 * conversation takes it with {@link #dueFor}. {@link #claim} keeps two tabs from sending the
 * same reservation. The clock is the wall clock, read every second, so a computer that slept
 * through the time sends the message as soon as it wakes.
 */
public final class ScheduledMessages {

    /** Longest message accepted, in characters. */
    public static final int MAX_MESSAGE_CHARS = 100_000;
    /** How long a delivery handed to one tab blocks handing it to another. */
    static final long CLAIM_MS = TimeUnit.SECONDS.toMillis(30);

    /** Why a reservation was refused; the webview shows a sentence for each. */
    public static final class Refused extends Exception {
        public final String code;

        public Refused(String code) {
            super(code);
            this.code = code;
        }
    }

    private static final class Claim {
        final Object owner;
        final long atMs;

        Claim(Object owner, long atMs) {
            this.owner = owner;
            this.atMs = atMs;
        }
    }

    private static final Logger LOG = Logger.getInstance(ScheduledMessages.class);
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    private final Path file;
    private final LongSupplier clock;
    private final Map<String, ScheduledMessage> byId = new LinkedHashMap<>();
    private final Set<String> announced = new HashSet<>();
    private final Map<String, Claim> claims = new HashMap<>();
    private Consumer<ScheduledMessage> deliverer;
    private ScheduledExecutorService ticker;
    private boolean loaded;

    public ScheduledMessages(Path file, LongSupplier clock) {
        this.file = file;
        this.clock = clock;
    }

    /** Start checking once a second; {@code onDue} is told about each reservation as it comes due. */
    public synchronized void start(Consumer<ScheduledMessage> onDue) {
        useDeliverer(onDue);
        if (ticker == null) {
            ticker = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "scheduled-messages");
                t.setDaemon(true);
                return t;
            });
            ticker.scheduleWithFixedDelay(this::tickSafely, 1, 1, TimeUnit.SECONDS);
        }
    }

    /** Who is told about due reservations; {@link #start} also starts the clock, tests call {@link #tick} themselves. */
    synchronized void useDeliverer(Consumer<ScheduledMessage> onDue) {
        this.deliverer = onDue;
        load();
    }

    /** The conversation's reservations, soonest first. */
    public synchronized List<ScheduledMessage> forSession(String sessionId) {
        load();
        List<ScheduledMessage> list = new ArrayList<>();
        for (ScheduledMessage m : byId.values()) {
            if (m.sessionId.equals(sessionId)) {
                list.add(m.copy());
            }
        }
        list.sort(Comparator.comparingLong(m -> m.sendAtMs()));
        return list;
    }

    /** Reserve {@code message} for {@code sessionId} at {@code sendAt} (an ISO-8601 instant). */
    public synchronized ScheduledMessage create(String sessionId, String sendAt, String message,
                                                String provider, String cwd) throws Refused {
        load();
        if (sessionId == null || sessionId.isBlank()) {
            throw new Refused("session_required");
        }
        ScheduledMessage m = new ScheduledMessage();
        m.id = UUID.randomUUID().toString();
        m.sessionId = sessionId.trim();
        m.sendAt = checkedSendAt(sendAt);
        m.message = checkedMessage(message);
        m.createdAt = Instant.ofEpochMilli(clock.getAsLong()).toString();
        m.provider = provider;
        m.cwd = cwd;
        byId.put(m.id, m);
        save();
        return m.copy();
    }

    /** Change a reservation's message and time. */
    public synchronized ScheduledMessage update(String id, String sendAt, String message) throws Refused {
        load();
        ScheduledMessage m = id == null ? null : byId.get(id);
        if (m == null) {
            throw new Refused("not_found");
        }
        String checkedAt = checkedSendAt(sendAt);
        String checkedText = checkedMessage(message);
        m.sendAt = checkedAt;
        m.message = checkedText;
        announced.remove(id);
        claims.remove(id);
        save();
        return m.copy();
    }

    /** Remove a reservation (cancelled, or sent); answers the conversation it belonged to, or null. */
    public synchronized String remove(String id) {
        load();
        ScheduledMessage m = id == null ? null : byId.remove(id);
        if (m == null) {
            return null;
        }
        announced.remove(id);
        claims.remove(id);
        save();
        return m.sessionId;
    }

    /** The chat sent it: the reservation is done. */
    public String delivered(String id) {
        return remove(id);
    }

    /** Remove every reservation of a conversation (it was deleted); answers how many. */
    public synchronized int removeSession(String sessionId) {
        load();
        List<String> ids = new ArrayList<>();
        for (ScheduledMessage m : byId.values()) {
            if (m.sessionId.equals(sessionId)) {
                ids.add(m.id);
            }
        }
        for (String id : ids) {
            byId.remove(id);
            announced.remove(id);
            claims.remove(id);
        }
        if (!ids.isEmpty()) {
            save();
        }
        return ids.size();
    }

    /** The conversation's reservations that are due now. */
    public synchronized List<ScheduledMessage> dueFor(String sessionId) {
        long now = clock.getAsLong();
        List<ScheduledMessage> due = new ArrayList<>();
        for (ScheduledMessage m : forSession(sessionId)) {
            if (m.sendAtMs() <= now) {
                due.add(m);
            }
        }
        return due;
    }

    /**
     * Take a due reservation for sending by {@code owner} (the receiving tab); false while
     * another owner took it in the last {@link #CLAIM_MS}, or when it is gone. The same owner
     * may take it again: a tab that was handed it before it knew its conversation asks again,
     * and the chat ignores a reservation it already sent.
     */
    public synchronized boolean claim(String id, Object owner) {
        if (id == null || owner == null || !byId.containsKey(id)) {
            return false;
        }
        long now = clock.getAsLong();
        Claim held = claims.get(id);
        if (held != null && held.owner != owner && now - held.atMs < CLAIM_MS) {
            return false;
        }
        claims.put(id, new Claim(owner, now));
        return true;
    }

    /** Hand each reservation that has come due, and was not handed before, to the deliverer. */
    void tick() {
        List<ScheduledMessage> due = new ArrayList<>();
        Consumer<ScheduledMessage> target;
        synchronized (this) {
            target = deliverer;
            if (target == null) {
                return;
            }
            long now = clock.getAsLong();
            for (ScheduledMessage m : byId.values()) {
                if (!announced.contains(m.id) && m.sendAtMs() <= now) {
                    announced.add(m.id);
                    due.add(m.copy());
                }
            }
        }
        for (ScheduledMessage m : due) {
            target.accept(m);
        }
    }

    private void tickSafely() {
        try {
            tick();
        } catch (RuntimeException e) {
            LOG.warn("Scheduled messages check failed", e);
        }
    }

    private static String checkedSendAt(String sendAt) throws Refused {
        Long ms = ScheduledMessage.parseInstantMs(sendAt);
        if (ms == null) {
            throw new Refused("time_invalid");
        }
        return Instant.ofEpochMilli(ms).toString();
    }

    private static String checkedMessage(String message) throws Refused {
        if (message == null || message.trim().isEmpty()) {
            throw new Refused("message_required");
        }
        if (message.length() > MAX_MESSAGE_CHARS) {
            throw new Refused("message_too_long");
        }
        return message;
    }

    private void load() {
        if (loaded) {
            return;
        }
        loaded = true;
        if (!Files.isRegularFile(file)) {
            return;
        }
        try {
            JsonElement root = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8));
            JsonArray list = root.isJsonObject() && root.getAsJsonObject().has("schedules")
                    && root.getAsJsonObject().get("schedules").isJsonArray()
                    ? root.getAsJsonObject().getAsJsonArray("schedules") : new JsonArray();
            for (JsonElement e : list) {
                ScheduledMessage m = e.isJsonObject() ? GSON.fromJson(e, ScheduledMessage.class) : null;
                if (m != null && m.id != null && m.sessionId != null && m.message != null && m.sendAtMs() != null) {
                    byId.put(m.id, m);
                }
            }
        } catch (IOException | RuntimeException e) {
            LOG.warn("Could not read " + file + "; starting without scheduled messages", e);
        }
    }

    private void save() {
        JsonObject root = new JsonObject();
        root.add("schedules", GSON.toJsonTree(new ArrayList<>(byId.values())));
        try {
            Path dir = file.toAbsolutePath().getParent();
            if (dir != null) {
                Files.createDirectories(dir);
            }
            Path temp = file.resolveSibling(file.getFileName() + "." + UUID.randomUUID() + ".tmp");
            try {
                Files.writeString(temp, GSON.toJson(root), StandardCharsets.UTF_8);
                try {
                    Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            LOG.warn("Could not write " + file, e);
        }
    }
}
