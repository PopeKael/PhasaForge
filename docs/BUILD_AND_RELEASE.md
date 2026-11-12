# Build and release

## Local Windows build

Prerequisites: Windows 11 x64, stable Rust MSVC toolchain, Node.js/npm, Microsoft C++ Build Tools, and WebView2.

```powershell
npm ci
npm run test:ui
cargo test --lib --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --no-bundle
```

Use the Tauri CLI command above to produce the standalone executable. It runs `beforeBuildCommand` (`npm run build`) and embeds the configured `frontendDist` (`../dist`) in the app. `devUrl` (`http://127.0.0.1:5173`) is for `tauri dev`. A raw `cargo build --release` is not the delivery command: it bypasses Tauri CLI's production build hook and can leave the frontend build/embedding step unverified. Do not copy a raw Cargo output as a release test artifact.

`scripts/build_learner_db.py` verifies the retained ThaiReader SHA256 manifest and the pinned Kaikki JSONL checksum, then rebuilds `assets/learner.sqlite`. The bundled database is a share-alike data derivative; see source attribution and license files before changing or redistributing it. App code remains MIT.

The 0.3.0 release files and hidden UI evidence are under `release-artifacts/0.3.0/`: `PhasaForge.exe`, `PhasaForge_0.3.0_x64-setup.exe`, checksum manifest, and UI screenshots. Local binaries are ignored by Git; the source and release instructions are committed. The installer is unsigned. The optional MMS model is downloaded separately and is not bundled.

For routine development acceptance, run exactly `npm run tauri build -- --no-bundle`. Do not run raw `cargo build --release` as the delivery build: without Tauri CLI's `beforeBuildCommand` and production frontend embedding step, the executable can use the development URL (`http://127.0.0.1:5173`) and show `ERR_CONNECTION_REFUSED` when Vite is not running. Confirm that `src-tauri/tauri.conf.json` points `frontendDist` at `../dist`, then check the production assets after Tauri runs `npm run build`. Copy the newly built `src-tauri/target/release/phasaforge.exe` to a new versioned test-artifact directory, record its size and SHA-256, and launch that copy directly with no Vite server running. For the current checkpoint, use `release-artifacts/0.6.3-syllable-alignment-verified/PhasaForge.exe`. Do not install the app for routine testing. NSIS/MSI packaging is a separate check and does not replace delivery of the standalone executable. Selected-text history acceptance should verify that Previous/Next restores saved sentence cards without issuing `analyze_text`, `translate_auto`, or `translate_ollama_auto` again; only a new text entry or explicit Retry translation may request processing.

The Windows sign-in option uses the Tauri autostart plugin. It is per-user, defaults off, and registration is changed only when the saved checkbox differs from the current Windows setting. Launching or rebuilding the executable does not enable autostart by itself. An executable moved after opting in may require changing the checkbox again so Windows registers its new path.

## Installer smoke test

The Windows CI workflow installs the current-user NSIS package silently, verifies its executable and uninstaller registration, uninstalls it silently, and checks cleanup. The acceptance record documents the 0.3.0 local install/uninstall verification.

## CI

`.github/workflows/windows.yml` runs the TypeScript build and UI logic tests, Rust check/tests, builds Windows installers, and smoke-tests NSIS install/uninstall. It uploads build artifacts on main, pull requests and manual runs. Tagged `v*` builds attach unsigned installers to a private prerelease only after the repository has been created and GitHub authentication configured. The workflow never changes repository visibility.

## Update status and signing

There is no active updater, signing key, or private update endpoint. Keep the repository private. Before enabling updater artifacts, generate a key outside Git, store the private key/password only as protected GitHub Actions secrets, configure the public key in the app, and provide a private-test endpoint. Private GitHub Releases do not provide an unauthenticated updater feed. Public release remains an explicit product decision.
