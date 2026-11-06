# Build and release

## Local Windows build

Prerequisites: Windows 11 x64, stable Rust MSVC toolchain, Node.js/npm, Microsoft C++ Build Tools, and WebView2.

```powershell
npm ci
npm run build
npm run test:ui
cargo test --lib --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles nsis
```

`scripts/build_learner_db.py` verifies the retained ThaiReader SHA256 manifest and the pinned Kaikki JSONL checksum, then rebuilds `assets/learner.sqlite`. The bundled database is a share-alike data derivative; see source attribution and license files before changing or redistributing it. App code remains MIT.

The 0.3.0 release files and hidden UI evidence are under `release-artifacts/0.3.0/`: `PhasaForge.exe`, `PhasaForge_0.3.0_x64-setup.exe`, checksum manifest, and UI screenshots. Local binaries are ignored by Git; the source and release instructions are committed. The installer is unsigned. The optional MMS model is downloaded separately and is not bundled.

## Installer smoke test

The Windows CI workflow installs the current-user NSIS package silently, verifies its executable and uninstaller registration, uninstalls it silently, and checks cleanup. The acceptance record documents the 0.3.0 local install/uninstall verification.

## CI

`.github/workflows/windows.yml` runs the TypeScript build and UI logic tests, Rust check/tests, builds Windows installers, and smoke-tests NSIS install/uninstall. It uploads build artifacts on main, pull requests and manual runs. Tagged `v*` builds attach unsigned installers to a private prerelease only after the repository has been created and GitHub authentication configured. The workflow never changes repository visibility.

## Update status and signing

There is no active updater, signing key, or private update endpoint. Keep the repository private. Before enabling updater artifacts, generate a key outside Git, store the private key/password only as protected GitHub Actions secrets, configure the public key in the app, and provide a private-test endpoint. Private GitHub Releases do not provide an unauthenticated updater feed. Public release remains an explicit product decision.
