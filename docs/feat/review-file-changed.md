# File Changed During a Diff Review

## Goal

Bring "You're told when the file changes while you're reviewing" from the Claude Code
GUI ("Swttch") plugin to CC GUI. There, approving an edit after the file had changed on
disk overwrote the newer text: one user lost a 1,090-line file twice in a session while
editing the same file in the IDE.

The same could happen here. When Claude asks to Edit or Write a file, CC GUI reads the
file and opens a read-only diff of Claude's change against it. Approving tells the CLI
to go ahead, and the CLI checked the file **before** it asked, not after. A file saved
in between, by you in an editor, by a build, or by another session, was overwritten with
content Claude made from the older text. For Write the whole file was replaced.

## Behaviour

When you approve a review, the file is read again first.

| What happened to the file while the diff was open | What you get |
|---------------------------------------------------|--------------|
| Nothing | Approved, as before |
| Changed (or created, or deleted) | Nothing is written. A warning says the file changed, and a new review opens with Claude's change against the file as it is now. That review decides. |
| Changed so that Claude's Edit no longer fits (the text it replaces is gone) | Nothing is written. A warning says so; the request is refused, and Claude is told it was not allowed. Ask Claude to read the file again. |

Rejecting or closing the diff answers "no" without reading the file again. A file that
keeps changing gets a new review each time you approve.

The warnings appear as IDE notifications ("CC GUI Notifications"):

- *notes.txt changed on disk while you were reviewing it. Nothing was written: the change
  Claude proposed is shown again against the file as it is now.*
- *notes.txt changed on disk while you were reviewing it, and the edit Claude proposed no
  longer fits the new text, so nothing was written. Ask Claude to read the file again.*

## Limits

- **Only saved changes count.** The check reads the file from disk. Unsaved edits in an
  open editor are not seen; when Claude then writes the file, the IDE handles it as any
  outside change to a file with unsaved edits.
- **You are told when you approve, not while the diff is open.** Swttch also warns early
  from the IDE's save events; that part is not ported.
- **A refused edit reads as "denied" to Claude.** The permission answer is yes or no, so
  Claude cannot be told the reason; the notification tells you instead.
- **Only reviews in the IDE diff.** Edits approved from the chat's permission dialog, or
  remembered with "Always Allow", are not reviewed and not re-read.

## How it works

`DiffReviewService.reviewFileChange` keeps the text it showed. When the diff resolves as
applied, it reads the file again (`changedSince(reviewed, current)`; a missing file counts
as `null`, so a file created meanwhile is a change) on the application's executor, not
the EDT, since the read refreshes the file from disk. If it changed, `reviewFileChange`
runs again on the current text; when that cannot build Claude's change (Edit's
`old_string` not found), the result is rejected. `PermissionService` answers the CLI only
when the returned future completes, so nothing reaches the CLI in between.

## Where it lives

| Part | File |
|------|------|
| Re-read and second review | `permission/DiffReviewService.java` (`changedSince`, `reviewAgainAfterChange`) |
| Messages | `diff.reviewBaseChanged`, `diff.reviewBaseChangedNotApplied` in all `ClaudeCodeGuiBundle*.properties` |
| Test | `permission/DiffReviewServiceChangedSinceTest.java` |

Checked against stand-ins for the IDE classes (real files on disk, the diff answered by
the test): an unchanged file is approved; a Write whose file was saved during the review
is not answered, and a second review shows the saved text; an Edit whose old text is gone
is refused with the second warning; a rejected review is not re-read; a file created
during the review gets a second review. With the re-read disabled the second case fails.
Not checked inside an IDE.
