package com.github.claudecodegui.handler.history;

import com.intellij.ide.util.PropertiesComponent;

/**
 * Whether the history list includes the sessions of projects nested below the
 * open one ("Include nested", ported from the Claude Code GUI ("Swttch") plugin).
 * Remembered for the whole IDE, as a way of browsing rather than a project setting.
 */
final class HistoryNestedPreference {

    static final String KEY = "claudecodegui.history.includeNested";

    private HistoryNestedPreference() {
    }

    static boolean isOn() {
        return PropertiesComponent.getInstance().getBoolean(KEY, false);
    }

    static void set(boolean on) {
        PropertiesComponent.getInstance().setValue(KEY, on, false);
    }
}
