# Contributing

Thanks for helping improve PhasaForge. Keep changes focused, preserve the approved interface and icon, and never include private user text or media in fixtures or logs.

Before opening a pull request:

1. Explain the user-visible change and any known limitations.
2. Run `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` on Windows.
3. For UI changes, verify the 640 × 480 layout and long Thai text with the app running.
4. Check dependency licences and add required notices before integrating third-party code or data.
5. Update `CHANGELOG.md` and the relevant product/acceptance documentation.

Do not add course files or speech models to the repository. Do not commit signing keys, credentials, recordings, or private content. For bugs and ideas, use the process in `SUPPORT.md`.
