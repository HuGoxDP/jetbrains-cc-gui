# Right-to-Left Layout, Persian and Arabic

## Goal

Bring Swttch's right-to-left support to CC GUI. A user who reads Persian or Arabic had
no interface in their language, and Persian or Arabic text in the chat ran in a
left-to-right layout, with punctuation landing on the wrong side.

## Behaviour

### Languages

Settings → Basic → Appearance → **Language** offers **فارسی** (Persian) and **العربية**
(Arabic). A string not yet translated shows in English, as in the other languages.
When the IDE's own language is Persian or Arabic, the plugin starts in it.

### The layout

Picking Persian or Arabic mirrors the interface: it reads from the right, the settings
menu, toggles and tabs flip, and arrows pointing back or forward point the other way.
Picking a left-to-right language turns it back.

The **Right-to-left layout** toggle under Language sets it by hand either way, for
example to keep an English interface but write Persian prompts in a mirrored chat. The
choice is kept until the next language change that changes reading direction: moving
between Persian and Arabic, or between English and French, leaves it as it is.

### What stays left to right

- Code blocks, inline code, diffs, terminal commands and their output, and math.
- Each message paragraph, list item, heading, table cell and quote takes its direction
  from its own first letter. A Persian answer reads right to left and an English line in
  it reads left to right, whatever the layout. The chat input does the same as you type.

## Limits

- **Some text is in English.** Model names, provider names, and code samples in help
  panels are not translated. Rarely used error texts may be in English until translated.
- **Native IDE windows** (dialogs, notifications, the tool window title) follow the IDE,
  not this setting.

## Where it lives

| Layer | Files |
|-------|-------|
| Direction | `webview/src/utils/uiDirection.ts` (the `dir` attribute of the document root; saved as `uiDirection`), applied in `webview/src/main.tsx` before the first render and on every language change |
| Mirrored styles | `webview/vite.config.ts` runs `postcss-rtlcss`, which adds a `[dir="rtl"]` counterpart to every left/right rule at build time; `webview/src/styles/less/components/rtl.less` keeps code left to right and flips directional icons |
| Setting | `webview/src/components/settings/BasicConfigSection/DirectionSection.tsx`, `LanguageSection.tsx` |
| Translations | `webview/src/i18n/locales/fa.json`, `ar.json` (Arabic also has the `_zero`, `_two`, `_few` and `_many` plural forms) |
| IDE language | `util/LanguageConfigService.java` maps a Persian or Arabic IDE to `fa` / `ar` |
