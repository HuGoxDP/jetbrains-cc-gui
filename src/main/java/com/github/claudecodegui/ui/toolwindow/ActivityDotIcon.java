package com.github.claudecodegui.ui.toolwindow;

import com.intellij.ui.JBColor;
import com.intellij.util.ui.JBUI;

import javax.swing.Icon;
import java.awt.Component;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;

/**
 * The dot a chat tab wears once Claude is waiting for an answer, or has just
 * finished. Drawn in the box of a regular icon so the tab title does not shift
 * when the dot replaces the spinner.
 */
public final class ActivityDotIcon implements Icon {

    /** Waiting for the user's answer. */
    public static final ActivityDotIcon AWAITING = new ActivityDotIcon(new JBColor(0xE0A100, 0xE6B422));
    /** The reply has just finished. */
    public static final ActivityDotIcon DONE = new ActivityDotIcon(new JBColor(0x3E9B4F, 0x5FB865));

    private final JBColor color;

    private ActivityDotIcon(JBColor color) {
        this.color = color;
    }

    @Override
    public void paintIcon(Component c, Graphics g, int x, int y) {
        Graphics2D g2 = (Graphics2D) g.create();
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setColor(color);
            int box = getIconWidth();
            int dot = Math.max(4, Math.round(box * 0.45f));
            int offset = (box - dot) / 2;
            g2.fillOval(x + offset, y + offset, dot, dot);
        } finally {
            g2.dispose();
        }
    }

    @Override
    public int getIconWidth() {
        return JBUI.scale(16);
    }

    @Override
    public int getIconHeight() {
        return JBUI.scale(16);
    }
}
