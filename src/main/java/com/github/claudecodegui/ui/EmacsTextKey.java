package com.github.claudecodegui.ui;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.KeyStroke;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Names the macOS Emacs-style text key an AWT key event stands for.
 *
 * <p>macOS gives every native text field a set of Ctrl+letter bindings (AppKit's
 * {@code StandardKeyBinding.dict}): caret moves (A, B, E, F, N, P, V) and edits
 * (D, H, K, L, O, T, Y). Under JCEF off-screen rendering, which remote JCEF forces on
 * macOS, the page receives every Ctrl+letter as Ctrl+A, so the webview cannot tell
 * these keys apart and the IDE has to say which one was pressed.</p>
 *
 * <p>The IDE reads it from the AWT key event, not from CEF: the shortcut action
 * {@link EmacsTextKeyShortcutGuard} registers on the browser component receives the
 * event with the real letter in its key code and the real Shift state, neither of
 * which the CEF event carries under OSR. When a non-Latin layout or an input method
 * leaves the key code undefined, the key character still names the letter as the
 * control character Ctrl+letter produces (Ctrl+A is 1 ... Ctrl+Z is 26).</p>
 *
 * <p>Ported from the Swttch plugin. The letters are the values the webview's
 * {@code utils/emacsKeys/emacsTextKey.ts} accepts.</p>
 */
public final class EmacsTextKey {

    /** One claimed key press: the lowercase letter and whether Shift was held. */
    public static final class Press {
        public final String letter;
        public final boolean shift;

        public Press(@NotNull String letter, boolean shift) {
            this.letter = letter;
            this.shift = shift;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Press)) {
                return false;
            }
            Press press = (Press) other;
            return shift == press.shift && letter.equals(press.letter);
        }

        @Override
        public int hashCode() {
            return Objects.hash(letter, shift);
        }

        @Override
        public String toString() {
            return "Press(" + letter + ", shift=" + shift + ")";
        }
    }

    /**
     * The single list of claimed letters. The keystrokes the guard registers and the
     * letter it reports are both derived from it, so the two cannot drift apart.
     */
    private static final char[] LETTERS = {
            'a', // Ctrl+A: start of the paragraph
            'b', // Ctrl+B: one character back
            'd', // Ctrl+D: delete the character after the caret
            'e', // Ctrl+E: end of the paragraph
            'f', // Ctrl+F: one character forward
            'h', // Ctrl+H: delete the character before the caret
            'k', // Ctrl+K: cut to the end of the paragraph
            'l', // Ctrl+L: center the caret in the visible area
            'n', // Ctrl+N: one row down
            'o', // Ctrl+O: open a line (insert a line break, caret stays before it)
            'p', // Ctrl+P: one row up
            't', // Ctrl+T: transpose the characters around the caret
            'v', // Ctrl+V: one page down
            'y', // Ctrl+Y: insert the last cut text
    };

    /** AWT key code to letter: VK_A..VK_Z equal the codes of 'A'..'Z'. */
    private static final Map<Integer, String> LETTER_BY_KEY_CODE = new LinkedHashMap<>();
    /** Control character to letter: Ctrl+letter produces letter - 'a' + 1. */
    private static final Map<Integer, String> LETTER_BY_CONTROL_CHARACTER = new LinkedHashMap<>();

    static {
        for (char letter : LETTERS) {
            LETTER_BY_KEY_CODE.put((int) Character.toUpperCase(letter), String.valueOf(letter));
            LETTER_BY_CONTROL_CHARACTER.put(letter - 'a' + 1, String.valueOf(letter));
        }
    }

    private EmacsTextKey() {
    }

    /**
     * The AWT keystrokes the guard claims while the webview has focus: Ctrl+letter and
     * Ctrl+Shift+letter for every claimed letter, on macOS only. Empty elsewhere, where
     * Ctrl+B and friends are ordinary IDE shortcuts.
     */
    public static @NotNull List<KeyStroke> claimedKeyStrokes(boolean isMac) {
        if (!isMac) {
            return Collections.emptyList();
        }
        int ctrl = InputEvent.CTRL_DOWN_MASK;
        int ctrlShift = ctrl | InputEvent.SHIFT_DOWN_MASK;
        List<KeyStroke> strokes = new ArrayList<>();
        for (int code : LETTER_BY_KEY_CODE.keySet()) {
            strokes.add(KeyStroke.getKeyStroke(code, ctrl));
            strokes.add(KeyStroke.getKeyStroke(code, ctrlShift));
        }
        return strokes;
    }

    /**
     * The claimed press an AWT key event stands for, or null when it names none of the
     * fourteen letters.
     *
     * <p>The letter comes from the key code when it is VK_A..VK_Z. Only when it is not
     * (a non-Latin layout or an input method can leave it VK_UNDEFINED) does the key
     * character decide, and then only as a control character 1..26. A letter key code
     * that is not one of the fourteen (Ctrl+C, say) is null outright. Backspace is the
     * one physical key whose own character (8) is a claimed control character (Ctrl+H's),
     * so its key code never falls back.</p>
     */
    public static @Nullable Press pressOf(int keyCode, char keyChar, boolean shiftDown) {
        String letter;
        if (keyCode >= KeyEvent.VK_A && keyCode <= KeyEvent.VK_Z) {
            letter = LETTER_BY_KEY_CODE.get(keyCode);
        } else if (keyCode == KeyEvent.VK_BACK_SPACE) {
            letter = null;
        } else {
            letter = LETTER_BY_CONTROL_CHARACTER.get((int) keyChar);
        }
        return letter == null ? null : new Press(letter, shiftDown);
    }
}
