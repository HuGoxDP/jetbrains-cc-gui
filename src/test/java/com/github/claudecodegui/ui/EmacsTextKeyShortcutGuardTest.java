package com.github.claudecodegui.ui;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.CustomShortcutSet;
import com.intellij.openapi.actionSystem.KeyboardShortcut;
import com.intellij.openapi.actionSystem.Shortcut;
import org.junit.Test;

import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.KeyStroke;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/** Ported from the Swttch plugin's EmacsTextKeyShortcutGuardTest. */
public class EmacsTextKeyShortcutGuardTest {

    private final JPanel component = new JPanel();

    private static final class Registration {
        final AnAction action;
        final CustomShortcutSet shortcuts;
        final JComponent component;

        Registration(AnAction action, CustomShortcutSet shortcuts, JComponent component) {
            this.action = action;
            this.shortcuts = shortcuts;
            this.component = component;
        }
    }

    private final List<Registration> registrations = new ArrayList<>();
    private final EmacsTextKeyShortcutGuard.Registrar record =
            (action, shortcuts, target) -> registrations.add(new Registration(action, shortcuts, target));

    private static final int CTRL = InputEvent.CTRL_DOWN_MASK;
    private static final int SHIFT = InputEvent.SHIFT_DOWN_MASK;

    private KeyEvent pressed(int keyCode, char keyChar, int modifiers) {
        return new KeyEvent(component, KeyEvent.KEY_PRESSED, 0L, modifiers, keyCode, keyChar);
    }

    private static Set<KeyStroke> strokesOf(CustomShortcutSet set) {
        Shortcut[] shortcuts = set.getShortcuts();
        return Arrays.stream(shortcuts)
                .map(s -> ((KeyboardShortcut) s).getFirstKeyStroke())
                .collect(Collectors.toSet());
    }

    @Test
    public void registersOneActionForAllClaimedKeystrokesOnTheComponent() {
        EmacsTextKeyShortcutGuard.install(component, true, record, (letter, shift) -> { });

        assertEquals(1, registrations.size());
        Registration only = registrations.get(0);
        assertSame(component, only.component);
        assertEquals(new HashSet<>(EmacsTextKey.claimedKeyStrokes(true)), strokesOf(only.shortcuts));
        assertEquals(28, only.shortcuts.getShortcuts().length);
    }

    @Test
    public void aSecondInstallRegistersNothingAndRePointsTheCallback() {
        List<String> first = new ArrayList<>();
        List<String> second = new ArrayList<>();
        EmacsTextKeyShortcutGuard.install(component, true, record, (letter, shift) -> first.add(letter));
        EmacsTextKeyShortcutGuard.install(component, true, record, (letter, shift) -> second.add(letter));

        assertEquals("a re-wired browser must not stack a second action", 1, registrations.size());

        EmacsTextKeyShortcutGuard.Receiver receiver = EmacsTextKeyShortcutGuard.receiverOf(component);
        assertNotNull(receiver);
        receiver.deliver(pressed(KeyEvent.VK_F, (char) 6, CTRL));

        assertTrue(first.isEmpty());
        assertEquals(List.of("f"), second);
    }

    @Test
    public void separateComponentsGetSeparateRegistrations() {
        EmacsTextKeyShortcutGuard.install(component, true, record, (letter, shift) -> { });
        EmacsTextKeyShortcutGuard.install(new JPanel(), true, record, (letter, shift) -> { });

        assertEquals(2, registrations.size());
    }

    @Test
    public void installsNothingOffMac() {
        EmacsTextKeyShortcutGuard.install(component, false, record, (letter, shift) -> { });

        assertTrue(registrations.isEmpty());
        assertNull(EmacsTextKeyShortcutGuard.receiverOf(component));
    }

    @Test
    public void reportsTheLetterAndTheShiftState() {
        List<String> reported = new ArrayList<>();
        EmacsTextKeyShortcutGuard.install(component, true, record, (letter, shift) -> reported.add(letter + ":" + shift));
        EmacsTextKeyShortcutGuard.Receiver receiver = EmacsTextKeyShortcutGuard.receiverOf(component);
        assertNotNull(receiver);

        receiver.deliver(pressed(KeyEvent.VK_B, (char) 2, CTRL));
        receiver.deliver(pressed(KeyEvent.VK_E, (char) 5, CTRL | SHIFT));
        receiver.deliver(pressed(KeyEvent.VK_UNDEFINED, (char) 11, CTRL));
        // Names none of the fourteen letters: ignored.
        receiver.deliver(null);
        receiver.deliver(pressed(KeyEvent.VK_C, (char) 3, CTRL));
        receiver.deliver(pressed(KeyEvent.VK_UNDEFINED, KeyEvent.CHAR_UNDEFINED, CTRL));

        assertEquals(List.of("b:false", "e:true", "k:false"), reported);
    }

    @Test
    public void theRegisteredKeystrokesAreTheOnesAnAwtCtrlLetterEventProduces() {
        EmacsTextKeyShortcutGuard.install(component, true, record, (letter, shift) -> { });
        Set<KeyStroke> strokes = strokesOf(registrations.get(0).shortcuts);

        assertTrue(strokes.contains(KeyStroke.getKeyStrokeForEvent(pressed(KeyEvent.VK_T, (char) 20, CTRL))));
        assertTrue(strokes.contains(KeyStroke.getKeyStrokeForEvent(pressed(KeyEvent.VK_V, (char) 22, CTRL | SHIFT))));
    }
}
