# Your Own Command for the `@` File List (`fileSuggestion`)

## Goal

Honor Claude Code's `fileSuggestion` setting, as Swttch does. It lets a user replace the
`@` file list with a command of their own: a repository with submodules can list them with
`git ls-files --recurse-submodules`, a huge one can use `fd` or an index it already keeps.
A setting that works in the terminal now works in the plugin too.

```json
"fileSuggestion": { "type": "command", "command": "git ls-files --recurse-submodules" }
```

## Behaviour

- When the setting is there, typing `@` in a Claude conversation runs the command with the
  CLI's contract: in a shell (`bash`, Git Bash on Windows) in the project folder, with
  `CLAUDE_PROJECT_DIR` set, `{"query": "<what follows @>"}` on stdin. It prints one path
  per line; the first 15 are listed, in the command's order. Running terminals and services
  are still listed above them, as before.
- The list is shown as the command gave it: the chat does not filter it again by its own
  matching, so the command decides what matches.
- Browsing a folder (`@src/`) keeps the built-in list.
- If the command fails, prints nothing usable, or takes more than 5 seconds, the built-in
  list is used.

### Where it is read from

As in the CLI, the project's `.claude/settings.local.json` wins over its
`.claude/settings.json`, which wins over the user's `settings.json` (in the Claude folder
for this project, see `CLAUDE_CONFIG_DIR`).

### Settings

**Settings → Basic → Environment → @ file list command** edits the user's setting: Save
writes `fileSuggestion` into that `settings.json` and leaves the rest of the file as it
was; an empty field removes the setting. When the project's own settings set a command,
the field says which file does, since that one is used.

## Where it lives

| Layer | Files |
|-------|-------|
| Running the command | `handler/file/FileSuggestionCommand.java`, used by `handler/file/FileHandler.java` (`list_files`, answered with `source: "fileSuggestion"`) |
| Settings | `handler/file/FileSuggestionHandler.java` (`get_file_suggestion`, `set_file_suggestion` → `window.updateFileSuggestion`), `webview/.../BasicConfigSection/FileSuggestionSection.tsx` |
| Chat | `webview/.../ChatInputBox/providers/fileReferenceProvider.ts` (keeps a `fileSuggestion` list as it came) |
