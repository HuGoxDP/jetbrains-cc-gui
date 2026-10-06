package com.github.claudecodegui.ui;

import org.junit.Test;

import javax.swing.JPanel;
import javax.swing.KeyStroke;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.util.HashSet;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * Guards which keystrokes {@link EmacsTextKey#claimedKeyStrokes} keeps away from the
 * IDE's keymap, and how {@link EmacsTextKey#pressOf} reads the letter and the Shift
 * state out of the AWT event. Ported from the Swttch plugin's tests.
 */
public class EmacsTextKeyTest {

    private final JPanel source = new JPanel();

    private static final int CTRL = InputEvent.CTRL_DOWN_MASK;
    private static final int SHIFT = InputEvent.SHIFT_DOWN_MASK;
    private static final int META = InputEvent.META_DOWN_MASK;
    private static final int ALT = InputEvent.ALT_DOWN_MASK;

    /** The fourteen claimed letters: AWT key code, control character, letter. */
    private static final Object[][] CLAIMED = {
            {KeyEvent.VK_A, 1, "a"}, {KeyEvent.VK_B, 2, "b"}, {KeyEvent.VK_D, 4, "d"},
            {KeyEvent.VK_E, 5, "e"}, {KeyEvent.VK_F, 6, "f"}, {KeyEvent.VK_H, 8, "h"},
            {KeyEvent.VK_K, 11, "k"}, {KeyEvent.VK_L, 12, "l"}, {KeyEvent.VK_N, 14, "n"},
            {KeyEvent.VK_O, 15, "o"}, {KeyEvent.VK_P, 16, "p"}, {KeyEvent.VK_T, 20, "t"},
            {KeyEvent.VK_V, 22, "v"}, {KeyEvent.VK_Y, 25, "y"},
    };

    private KeyEvent pressed(int keyCode, int modifiers) {
        return new KeyEvent(source, KeyEvent.KEY_PRESSED, 0L, modifiers, keyCode, KeyEvent.CHAR_UNDEFINED);
    }

    private boolean claims(boolean isMac, KeyEvent event) {
        return EmacsTextKey.claimedKeyStrokes(isMac).contains(KeyStroke.getKeyStrokeForEvent(event));
    }

    @Test
    public void claimsCtrlAndCtrlShiftPlusEachOfTheFourteenLettersOnMac() {
        for (Object[] row : CLAIMED) {
            int code = (int) row[0];
            assertTrue("Ctrl+" + KeyEvent.getKeyText(code), claims(true, pressed(code, CTRL)));
            assertTrue("Ctrl+Shift+" + KeyEvent.getKeyText(code), claims(true, pressed(code, CTRL | SHIFT)));
        }
        assertEquals(28, new HashSet<>(EmacsTextKey.claimedKeyStrokes(true)).size());
    }

    @Test
    public void leavesOtherChordsToTheIde() {
        for (Object[] row : CLAIMED) {
            int code = (int) row[0];
            assertFalse("Cmd+letter", claims(true, pressed(code, META)));
            assertFalse("Ctrl+Cmd+letter", claims(true, pressed(code, CTRL | META)));
            assertFalse("Ctrl+Alt+letter", claims(true, pressed(code, CTRL | ALT)));
            assertFalse("plain letter", claims(true, pressed(code, 0)));
        }
        for (int code : new int[]{KeyEvent.VK_C, KeyEvent.VK_Z, KeyEvent.VK_X, KeyEvent.VK_J, KeyEvent.VK_ENTER, KeyEvent.VK_SPACE}) {
            assertFalse("Ctrl+" + KeyEvent.getKeyText(code), claims(true, pressed(code, CTRL)));
        }
    }

    @Test
    public void claimsNothingOutsideMac() {
        assertTrue(EmacsTextKey.claimedKeyStrokes(false).isEmpty());
    }

    @Test
    public void everyClaimedKeystrokeNamesTheLetterTheGuardReports() {
        List<KeyStroke> strokes = EmacsTextKey.claimedKeyStrokes(true);
        for (KeyStroke stroke : strokes) {
            boolean shiftDown = (stroke.getModifiers() & SHIFT) != 0;
            assertEquals(
                    new EmacsTextKey.Press(KeyEvent.getKeyText(stroke.getKeyCode()).toLowerCase(), shiftDown),
                    EmacsTextKey.pressOf(stroke.getKeyCode(), KeyEvent.CHAR_UNDEFINED, shiftDown));
        }
    }

    @Test
    public void readsTheLetterFromTheKeyCodeAndFallsBackToTheControlCharacter() {
        for (Object[] row : CLAIMED) {
            int code = (int) row[0];
            char control = (char) (int) (Integer) row[1];
            String letter = (String) row[2];
            assertEquals(new EmacsTextKey.Press(letter, false), EmacsTextKey.pressOf(code, control, false));
            assertEquals(new EmacsTextKey.Press(letter, false), EmacsTextKey.pressOf(code, KeyEvent.CHAR_UNDEFINED, false));
            // A non-Latin layout or an input method can leave the key code undefined.
            assertEquals(new EmacsTextKey.Press(letter, true), EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, control, true));
        }
    }

    @Test
    public void aLetterOutsideTheFourteenIsNotRescuedByTheKeyCharacter() {
        for (int code : new int[]{KeyEvent.VK_C, KeyEvent.VK_G, KeyEvent.VK_J, KeyEvent.VK_Z}) {
            assertNull(EmacsTextKey.pressOf(code, (char) 2, false));
        }
        for (int control : new int[]{3, 7, 9, 10, 13, 17, 18, 19, 21, 23, 24, 26, 0, 27, 127}) {
            assertNull("control character " + control, EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, (char) control, false));
        }
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_UNDEFINED, 'b', false));
    }

    @Test
    public void physicalKeysThatCarryAControlCharacterAreNotTakenForALetter() {
        assertNull("Backspace is not Ctrl+H", EmacsTextKey.pressOf(KeyEvent.VK_BACK_SPACE, (char) 8, false));
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_DELETE, (char) 127, false));
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_TAB, (char) 9, false));
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_ENTER, (char) 10, false));
        assertNull(EmacsTextKey.pressOf(KeyEvent.VK_ESCAPE, (char) 27, false));
    }
}
