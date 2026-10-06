package com.github.claudecodegui.ui;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.CustomShortcutSet;
import com.intellij.openapi.actionSystem.KeyboardShortcut;
import com.intellij.openapi.actionSystem.Shortcut;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.util.SystemInfo;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.swing.JComponent;
import javax.swing.KeyStroke;
import java.awt.event.KeyEvent;
import java.util.List;
import java.util.function.BiConsumer;

/**
 * Reports the macOS Emacs text keys pressed while the webview has focus, and keeps the
 * IDE's keymap from running its own action for them.
 *
 * <p>When the IDE's key dispatcher looks for an action bound to a keystroke, it asks the
 * focused component and its ancestors for their own shortcut actions before it consults
 * the keymap, performs the first enabled one, and consumes the key event. This registers
 * one such action on the browser component for every claimed keystroke
 * ({@link EmacsTextKey#claimedKeyStrokes}). Two things follow:</p>
 * <ul>
 *   <li>The keymap's action for the same keystroke does not run. IntelliJ's macOS keymap
 *       binds Ctrl+T to "Refactor This" and Ctrl+V to the VCS popup, which would take
 *       focus away from the page.</li>
 *   <li>The key never reaches CEF, so the action is what reports it: the AWT event it
 *       receives carries the real letter and Shift state (see {@link EmacsTextKey}).</li>
 * </ul>
 *
 * <p>A browser component can be wired again (a reload replaces the browser, a window can
 * pick a component up again), so {@link #install} registers the action only once per
 * component and later calls only re-point the callback.</p>
 *
 * <p>Ported from the Swttch plugin.</p>
 */
public final class EmacsTextKeyShortcutGuard {

    /** Client-property key under which a component keeps its {@link Receiver}. */
    private static final Object RECEIVER_KEY = new Object();

    /** Registers an action with its shortcuts on a component; replaced in tests. */
    @FunctionalInterface
    public interface Registrar {
        void register(@NotNull AnAction action, @NotNull CustomShortcutSet shortcuts, @NotNull JComponent component);
    }

    /** Turns the AWT event of a performed shortcut into a report to the current callback. */
    public static final class Receiver {
        private volatile BiConsumer<String, Boolean> onKey;

        Receiver(@NotNull BiConsumer<String, Boolean> onKey) {
            this.onKey = onKey;
        }

        void setOnKey(@NotNull BiConsumer<String, Boolean> onKey) {
            this.onKey = onKey;
        }

        /** Reports the event when it is one of the claimed presses; ignores anything else. */
        public void deliver(@Nullable KeyEvent event) {
            if (event == null) {
                return;
            }
            EmacsTextKey.Press press = EmacsTextKey.pressOf(event.getKeyCode(), event.getKeyChar(), event.isShiftDown());
            if (press == null) {
                return;
            }
            onKey.accept(press.letter, press.shift);
        }
    }

    private EmacsTextKeyShortcutGuard() {
    }

    /** Makes {@code browserComponent} report the claimed keys to {@code onKey}, on macOS. */
    public static void install(@NotNull JComponent browserComponent, @NotNull BiConsumer<String, Boolean> onKey) {
        install(browserComponent, SystemInfo.isMac,
                (action, shortcuts, component) -> action.registerCustomShortcutSet(shortcuts, component),
                onKey);
    }

    /**
     * The first call on a component registers the shortcut action; every later call on
     * the same component only replaces the callback. Does nothing when no keystroke is
     * claimed (every platform except macOS).
     */
    public static void install(
            @NotNull JComponent browserComponent,
            boolean isMac,
            @NotNull Registrar registrar,
            @NotNull BiConsumer<String, Boolean> onKey
    ) {
        List<KeyStroke> strokes = EmacsTextKey.claimedKeyStrokes(isMac);
        if (strokes.isEmpty()) {
            return;
        }
        Receiver existing = receiverOf(browserComponent);
        if (existing != null) {
            existing.setOnKey(onKey);
            return;
        }
        Receiver receiver = new Receiver(onKey);
        browserComponent.putClientProperty(RECEIVER_KEY, receiver);
        Shortcut[] shortcuts = strokes.stream()
                .map(stroke -> new KeyboardShortcut(stroke, null))
                .toArray(Shortcut[]::new);
        registrar.register(new ReportAction(receiver), new CustomShortcutSet(shortcuts), browserComponent);
    }

    /** The receiver {@link #install} left on the component, or null when none was installed. */
    static @Nullable Receiver receiverOf(@NotNull JComponent component) {
        Object value = component.getClientProperty(RECEIVER_KEY);
        return value instanceof Receiver ? (Receiver) value : null;
    }

    /**
     * Being found and performed is half of its job: it stands in front of the keymap
     * actions bound to the same keystrokes. The other half is handing the key event on.
     */
    private static final class ReportAction extends DumbAwareAction {
        private final Receiver receiver;

        ReportAction(@NotNull Receiver receiver) {
            this.receiver = receiver;
        }

        @Override
        public @NotNull ActionUpdateThread getActionUpdateThread() {
            return ActionUpdateThread.BGT;
        }

        @Override
        public void update(@NotNull AnActionEvent e) {
            // Always enabled: a disabled component action would let the dispatcher fall
            // through to the keymap action again.
            e.getPresentation().setEnabled(true);
        }

        @Override
        public void actionPerformed(@NotNull AnActionEvent e) {
            receiver.deliver(e.getInputEvent() instanceof KeyEvent ? (KeyEvent) e.getInputEvent() : null);
        }
    }
}
