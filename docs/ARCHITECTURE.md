# Architecture

## Current shape

- **Rust host:** Tauri 2 owns the Windows process, tray menu and window lifecycle. A dedicated `WH_KEYBOARD_LL` callback tracks only the configured left/right modifier state and trigger. It queues capture work without waiting; unrelated keys pass through and only the configured trigger keydown/up is consumed.
- **Selection capture:** A separate action thread reads UI Automation text and selection bounds before PhasaForge takes focus. If no selected text is exposed, an STA fallback snapshots the OLE clipboard data object, issues one Ctrl+C, reads Unicode text, and restores/flushed the prior data object. The UI reports if clipboard restoration fails. No clipboard polling runs at idle.
- **Frontend:** Vite plus TypeScript and plain DOM/CSS. No frontend framework or remote runtime dependency. Windows system fonts are used.
- **Persistence:** UI preferences and the user's meaning note use browser local storage in the app origin. No account or remote service is used.
- **Speech:** The Windows WinRT speech synthesizer enumerates installed `th-*` voices, synthesizes locally, and passes the WAV stream to the WebView for playback. The Web Speech API is a fallback only for Thai voices. Microphone practice captures and replays a local audio blob for the session; recognition is not implemented.
- **Placement:** Selection bounds or cursor coordinates are measured in desktop physical pixels. The window is positioned right/below when space allows, flips left/above when needed, and clamps to the nearest monitor work area without changing its size.
- **Assets:** `assets/` preserves the supplied UI concept and master icon. `src-tauri/icons/` contains a generated ICO derived from the supplied icon; the artwork itself is unchanged.

## Planned boundaries

Define provider traits/modules before adding translation or ASR. Keep OS capture, clipboard handling, TTS, ASR and Thai linguistic analysis replaceable. ASR should be a child process or isolated backend with an explicit lifecycle, admission check and release path. Model files belong in a user-selected external folder, not in Git or the installer.

## Idle and privacy invariants

At idle, the process may own its tray and a narrow keyboard hook that checks only the configured shortcut, but it must not poll the clipboard, hold microphone access, or retain an ASR model. No source passage or audio is sent to a server in this build. Avoid logging selected user text or other keyboard input.
