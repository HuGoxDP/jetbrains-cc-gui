package com.github.claudecodegui.account;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * File helpers for account data. Everything written here is user-private: credential
 * snapshots carry live OAuth tokens.
 */
final class AccountFiles {

    static final Gson GSON = new GsonBuilder().setPrettyPrinting().serializeNulls().create();

    private static final Set<PosixFilePermission> OWNER_ONLY =
            EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);

    private AccountFiles() {
    }

    /**
     * Write {@code content} to {@code target} through a temp file in the same directory,
     * so a crash never leaves a half-written credential file behind.
     *
     * <p>On POSIX the file is restricted to its owner (0600). Windows has no mode bits;
     * there the user profile ACL protects it, exactly as it protects the CLI's own
     * {@code .credentials.json}.
     */
    static void writePrivateAtomically(Path target, String content) throws IOException {
        Path dir = target.toAbsolutePath().getParent();
        if (dir != null) {
            Files.createDirectories(dir);
        }
        Path temp = (dir != null ? dir : Path.of(".")).resolve(
                target.getFileName() + "." + UUID.randomUUID() + ".tmp");
        try {
            Files.writeString(temp, content, StandardCharsets.UTF_8);
            restrictToOwner(temp);
            try {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
            restrictToOwner(target);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    static void restrictToOwner(Path path) {
        if (!FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            return;
        }
        try {
            Files.setPosixFilePermissions(path, OWNER_ONLY);
        } catch (Exception ignored) {
            // Best effort: some filesystems (e.g. mounted network shares) refuse chmod.
        }
    }

    /** Delete a directory tree, ignoring files that vanish meanwhile. */
    static void deleteTree(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (var walk = Files.walk(root)) {
            walk.sorted((a, b) -> b.getNameCount() - a.getNameCount()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // left for the next cleanup
                }
            });
        } catch (IOException ignored) {
            // left for the next cleanup
        }
    }
}
