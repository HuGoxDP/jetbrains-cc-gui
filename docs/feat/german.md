# German Interface

## Goal

Bring Swttch's German interface to CC GUI. A user who reads German had to use the plugin
in English or another language.

## Behaviour

Settings → Basic → Appearance → **Language** offers **Deutsch**, under English. Picking it
switches the whole webview at once: chat, input, permission and question dialogs, history,
settings, MCP, skills, prompts and the status panel. No restart is needed, and the choice is
kept for the next start.

With **Follow IDE**, the plugin starts in German when the IDE runs in German (any `de`
locale, such as `de_DE` or `de_AT`).

The text uses the informal *du*, as Swttch's German does. Plurals use German forms
("vor 1 Tag", "vor 3 Tagen"). Languages in the list keep their own names, so English still
reads "English" in the German interface.

## Limits

- **Some text stays in English.** Model names, provider names, CLI names, settings keys,
  paths, commands, and code samples in help panels are not translated.
- **Native IDE windows** (actions, dialogs, notifications, the tool window title) follow the
  IDE, not this setting. The plugin has no German bundle for them, so they show in English
  in a German IDE.

## Where it lives

| Layer | Files |
|-------|-------|
| Translations | `webview/src/i18n/locales/de.json` (every key of `en.json`); `settings.basic.language.german` ("Deutsch") added to every locale |
| Registration | `webview/src/i18n/config.ts`, the list in `LanguageSection.tsx`, the supported list in `webview/src/main.tsx` |
| IDE language | `util/LanguageConfigService.java` maps a German IDE to `de` and accepts `de` as a saved choice |
| Test | `webview/src/i18n/germanLocale.test.ts`: registered, same keys as English, every placeholder kept, German plurals |
