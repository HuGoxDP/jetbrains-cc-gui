package com.github.claudecodegui.permission;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Approving a review lets the CLI write, so DiffReviewService reads the file again first
 * and reviews again when it is no longer what the diff showed.
 */
public class DiffReviewServiceChangedSinceTest {

    @Test
    public void theSameTextIsNoChange() {
        assertFalse(DiffReviewService.changedSince("alpha\nbeta\n", "alpha\nbeta\n"));
    }

    @Test
    public void aSavedEditIsAChange() {
        assertTrue(DiffReviewService.changedSince("alpha\nbeta\n", "alpha\nbeta\nsaved\n"));
    }

    @Test
    public void aFileCreatedOrDeletedDuringTheReviewIsAChange() {
        assertTrue(DiffReviewService.changedSince(null, "made by someone else\n"));
        assertTrue(DiffReviewService.changedSince("alpha\n", null));
        assertFalse(DiffReviewService.changedSince(null, null));
    }
}
