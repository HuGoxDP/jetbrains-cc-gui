# Sessions of Nested Projects in the History List

## Goal

Bring "several projects in one repository, reachable from one place" from the Claude
Code GUI ("Swttch") plugin to CC GUI. Claude Code keeps each folder's sessions apart:
a conversation started in `packages/api` of a monorepo is stored under that folder,
not under the repository root. With the repository open in the IDE, the history list
showed only the root's own sessions, and the ones from its packages could not be
reached from it at all.

## Behaviour

**Include nested** next to the search box (and the **Active** filter) adds the sessions
of every project in a folder below the open one to the list, newest first among the
others.

- Each of those rows names its project first on its second line, relative to the open
  one: `packages/api • 5 messages • <session id>`. Hover it for the full path. The open
  project's own sessions have no name there.
- **Search** finds a session by its project too: `api` lists every session of
  `packages/api`, along with the titles that contain the word.
- **Opening** a nested session resumes it in its own folder, where Claude Code keeps it,
  so the conversation goes on as it would in a terminal opened there.
- **Delete** and **Export** work on nested sessions as on the others.
- The switch is remembered for the whole IDE, and starts off.
- It is offered for Claude only: the folders are Claude Code's own.

## How it works

- **Finding the projects.** Claude Code names a session folder after its path, with
  every character but letters and digits turned into `-`, which cannot be read back. So
  `NestedClaudeProjects` only uses the name to narrow the search (it starts with the
  project's own name and a `-`), and takes the real path from the `cwd` recorded on the
  first lines of a session in the folder. That also leaves out a sibling such as
  `repo-old`, whose name looks nested.
- **The list.** `getProjectDataAsJson(projectPath, includeNested)` reads each nested
  project's sessions through the same index and cache as the root's, and gives each
  of them `projectPath`; the root's sessions have none, so their JSON is unchanged.
  The answer says `includeNested`, which is how the webview knows the switch's state.
- **The switch.** The webview sends `set_history_include_nested` (`true`/`false`); Java
  stores it (`PropertiesComponent`) and sends the list again.
- **Opening.** `load_session` carries the session's `projectPath`, and Java resumes in
  that folder only when it is inside the open project; anything else is ignored.
- **Delete, export, subagent logs and deep search** look in the nested projects' folders
  as well (after the open project's own), and deep search clears their caches too.

## Limits

- **Claude only.** Codex and the other providers keep their sessions in their own
  places and have no switch.
- **Convert to CLI session** is not offered on a nested session's row, since the
  conversion looks only in the open project's folder; open the nested project itself to
  convert one.
- **Every project below is listed**, however deep. There is no tree to fold, unlike
  Swttch's session dropdown; the project name on each row and the search take its place.
- Checked in the webview with a list from three folders (the switch and the request it
  sends, the names, search by project, the folder sent on opening), and by unit tests of
  the folder discovery, the names and the request; the Java listing is covered by
  compiling, not seen in an IDE here.
