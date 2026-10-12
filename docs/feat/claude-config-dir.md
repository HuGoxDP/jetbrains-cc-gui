# Claude's Folder (CLAUDE_CONFIG_DIR), for All Projects or for One

## Goal

Bring the `CLAUDE_CONFIG_DIR` setting from the Claude Code GUI ("Swttch") plugin to CC
GUI. Claude Code keeps its settings, login, session history, skills, commands, plugins
and `.claude.json` in `~/.claude` (with `.claude.json` beside it in the home), and a
terminal user moves all of that with the documented `CLAUDE_CONFIG_DIR` environment
variable. A common reason is a separate login and history per project: a work
account for one repository and a personal one for another, often with direnv. CC GUI
only half-followed the variable: when the IDE inherited it, the account switcher read
the login from there, but the chat, the history list, skills and MCP servers kept
reading `~/.claude`. There was no way to set it per project at all.

## Behaviour

**Settings → Basic → Environment → CLAUDE_CONFIG_DIR** has two fields, each with
**Save** (Enter saves too):

- **All projects**: the folder every project uses. Empty means `~/.claude`.
- **This project**: the folder for the open project and every folder inside it. Empty
  means the same as all projects. The field is disabled when the project has no folder.

Under them, **In use here** shows the folder that applies to this project and why: set
for this project, set for an outer project that contains this one, set for all
projects, `CLAUDE_CONFIG_DIR` from the IDE's environment, or the default.

A folder is an absolute path, or starts with `~` (the home the runtime uses). Anything
else is refused under the fields, and what was typed stays there to be corrected. The
folder does not have to exist: Claude Code creates it on first use, as in a terminal.

What applies to a project, first match wins:

1. the value for that project, or for the deepest project that contains it;
2. the value for all projects;
3. `CLAUDE_CONFIG_DIR` inherited by the IDE (native runtime only: a WSL distro has its
   own environment, which the IDE cannot see);
4. `~/.claude`.

### What follows the folder

| Follows this project's folder | Follows the folder for all projects |
|---|---|
| The chat (the Claude process gets `CLAUDE_CONFIG_DIR`) and the transcript shown when a session is opened | Signing in (`claude auth login`) and switching between saved Claude accounts |
| The history list, opening, deleting, exporting and converting sessions, subagent transcripts, "Include nested" | The provider manager writing `settings.json` |
| Rewind | The signed-in account shown in settings |
| MCP servers: list, add, edit, enable, delete, status and tools | Prompt and commit-message helpers that run outside a project |
| Personal skills and commands, plugins and their marketplaces, the `settings.json` read for additional directories | |
| Plan usage for the current login | |

The account switcher and the provider manager stay on the folder for all projects
because they are set once for the whole IDE; a project with its own folder signs in
and picks its provider in that folder, as a terminal there would.

### When it takes effect

From the next message. A chat that is running keeps the folder it started with until
its next message, which starts Claude again in the new folder (the folder is part of
what decides whether the running Claude can be reused). The history list is read again
from the new folder.

## How it works

- **One resolver.** `ClaudeConfigDir` reads the two values from
  `~/.codemoss/config.json` (`claudeConfigDir`, and `claudeConfigDirs` keyed by project
  path), re-reading the file only when it changed, and answers for any folder: the
  folder itself (`dir`), its `projects` folder, its `.claude.json`, and the value to
  hand the CLI. Every reader that used to build `~/.claude/...` itself now asks it,
  passing the project or working directory it serves. A WSL runtime hands the readers
  `/home/me/app` for the project the IDE calls `//wsl.localhost/Ubuntu/home/me/app`,
  so a project's value matches either spelling.
- **The processes.** Every Node process the plugin starts gets the value for all
  projects (`EnvironmentConfigurator`); the spawns that know their project (sending,
  rewind, reading a transcript, MCP status, plan usage) override it with that
  project's. A WSL runtime gets
  the Linux form of the path, passed through `WSLENV`.
- **The daemon.** The long-running bridge process serves requests over time, so each
  request carries `CLAUDE_CONFIG_DIR` (in the request env, applied and restored per
  request) instead of relying on what the daemon was started with. An empty value
  unsets it for the request: a cleared setting must not leave the old folder behind,
  and an empty `CLAUDE_CONFIG_DIR` would make the CLI use a relative path.
- **The bridge.** `getClaudeDir()` and `.claude.json` in the bridge follow
  `CLAUDE_CONFIG_DIR`, read on every call; the runtime signature includes it, so a new
  folder starts a new Claude process. The write guard that protects
  `~/.claude/.credentials.json` protects the login in a moved folder too.
- **Caches.** Saving a value clears the session list indexes, which were built from
  the old folder.

## Limits

- Values are stored by the plugin in `~/.codemoss/config.json`; this is not a Claude
  Code setting, since the folder is what decides where Claude Code's own settings are.
- A terminal opened in the IDE does not get the variable: it is a separate program
  with its own environment.
- Saved accounts and the provider manager act on the folder for all projects (see
  above).

## Tests

- `ClaudeConfigDirTest` (Java): which value applies (project, deepest outer project,
  siblings with the same prefix, all projects, inherited, default), Windows slashes and
  case, the WSL spelling, writing and clearing the values, which folders are accepted.
- `ai-bridge/utils/claude-config-dir.test.js`: the bridge's folder and `.claude.json`,
  the credentials guard, the runtime signature.
- `ClaudeConfigDirSection.test.tsx` (webview): loading, saving each row, a refusal
  keeping what was typed, no project.
