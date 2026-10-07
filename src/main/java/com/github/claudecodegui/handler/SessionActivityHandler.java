package com.github.claudecodegui.handler;

import com.github.claudecodegui.handler.core.BaseMessageHandler;
import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.ui.toolwindow.SessionActivity;
import com.intellij.openapi.application.ApplicationManager;

/**
 * Answers the history list's request for what the open chat tabs are doing
 * ({@link SessionActivity}). The list asks when it opens, since a push it
 * missed while closed would otherwise leave it without dots until the next
 * change.
 */
public class SessionActivityHandler extends BaseMessageHandler {

    private static final String[] SUPPORTED_TYPES = {
            "get_session_activity",
    };

    public SessionActivityHandler(HandlerContext context) {
        super(context);
    }

    @Override
    public String[] getSupportedTypes() {
        return SUPPORTED_TYPES;
    }

    @Override
    public boolean handle(String type, String content) {
        if (!"get_session_activity".equals(type)) {
            return false;
        }
        ApplicationManager.getApplication().invokeLater(() -> SessionActivity.broadcast(context.getProject()));
        return true;
    }
}
