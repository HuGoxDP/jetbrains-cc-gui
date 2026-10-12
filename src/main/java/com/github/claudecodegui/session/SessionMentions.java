package com.github.claudecodegui.session;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.regex.Pattern;

/**
 * A message the user addressed to another running Claude session with the composer's
 * {@code @@} mention (ported from Swttch).
 *
 * <p>Sending between sessions is the model's own {@code SendMessage} tool; a terminal user
 * reaches it by asking for it in words, and this does the same. The user's text is sent as
 * they wrote it, so it stays their own message in the chat, and a system reminder after it
 * names the address and the exact words to deliver. History hides the reminder, as it hides
 * every system reminder.
 */
public final class SessionMentions {

    private static final String REMINDER_START =
            "<system-reminder>The text above is the user addressing another Claude session";
    private static final String REMINDER_END = "</system-reminder>";

    /** A session name as {@code claude agents --json} prints it. */
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9._-]{1,200}");

    private SessionMentions() {
    }

    /**
     * {@code prompt} with the delivery reminder for {@code mention} ({@code {name, body}})
     * after it, or {@code prompt} unchanged when the mention is missing or not usable.
     */
    public static String withReminder(String prompt, JsonElement mention) {
        if (prompt == null || mention == null || !mention.isJsonObject()) {
            return prompt;
        }
        JsonObject m = mention.getAsJsonObject();
        String name = string(m, "name");
        String body = string(m, "body");
        if (name == null || !NAME.matcher(name).matches() || body == null || body.isBlank()) {
            return prompt;
        }
        return prompt + "\n" + reminder(name, body.trim());
    }

    /**
     * {@code text} without a delivery reminder this class added: what the chat shows as the
     * user's own message while the turn runs (history hides it with every system reminder).
     */
    public static String withoutReminder(String text) {
        if (text == null) {
            return null;
        }
        int start = text.indexOf("\n" + REMINDER_START);
        if (start < 0) {
            return text;
        }
        int end = text.indexOf(REMINDER_END, start);
        if (end < 0) {
            return text;
        }
        return text.substring(0, start) + text.substring(end + REMINDER_END.length());
    }

    /** The reminder that asks the model to deliver {@code body} to {@code name}, in Swttch's words. */
    public static String reminder(String name, String body) {
        return REMINDER_START + " running "
                + "on this machine, named " + name + ", through the composer's @@ mention. It is NOT "
                + "addressed to you and is NOT a task for you. Deliver it verbatim with the SendMessage "
                + "tool (to: '" + name + "'). The message, without the @@ mention that addressed it, is "
                + "between the markers:\n---\n" + body + "\n---\nCall SendMessage now. Do not do anything "
                + "else and do not reply with prose." + REMINDER_END;
    }

    private static String string(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : null;
    }
}
