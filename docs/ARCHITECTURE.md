# Architecture

## Current shape

- **Rust host:** Tauri 2 owns the Windows app process, tray icon, global-shortcut registration and native window lifecycle.
- **Frontend:** Vite plus TypeScript and plain DOM/CSS. No frontend framework or remote runtime dependency. Windows system fonts are used.
- **Persistence:** UI preferences and the user's meaning note use browser local storage in the app origin. No account or remote service is used.
- **Speech:** `SpeechSynthesis` is asked only for an installed `th-*` voice. Microphone practice currently captures a local audio blob for the session and clearly reports that recognition is not implemented.
- **Assets:** `assets/` preserves the supplied UI concept and master icon. `src-tauri/icons/` contains a generated ICO derived from the supplied icon; the artwork itself is unchanged.

## Planned boundaries

Define provider traits/modules before adding translation or ASR. Keep OS capture, clipboard handling, TTS, ASR and Thai linguistic analysis replaceable. ASR should be a child process or isolated backend with an explicit lifecycle, admission check and release path. Model files belong in a user-selected external folder, not in Git or the installer.

## Idle and privacy invariants

At idle, the process may own its tray and registered shortcut, but it must not poll the clipboard, hold microphone access, or retain an ASR model. No source passage or audio is sent to a server in this build. Avoid logging selected user text.
