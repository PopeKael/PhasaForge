# Build and release

## Local Windows build

Prerequisites: Windows 11 x64, stable Rust MSVC toolchain, Node.js/npm, Microsoft C++ Build Tools, and WebView2.

```powershell
npm ci
npm run build
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles nsis
```

`scripts/build_learner_db.py` verifies every present upstream data file against its published SHA256 manifest and rebuilds `assets/learner.sqlite` from the retained, attributed TSV sources. App code is MIT; the derived learner-data portion has its separate CC BY-SA notice.

The versioned local 0.2.0 deliverables are under `release-artifacts/0.2.0/`: `PhasaForge.exe`, `PhasaForge_0.2.0_x64-setup.exe`, and UI verification screenshots. These local binaries are ignored by Git; the source and release instructions are committed. The installers are unsigned.

## Installer smoke test

The Windows CI workflow installs the current-user NSIS package silently, verifies its executable and uninstaller registration, uninstalls it silently, and checks cleanup. The 0.2.0 package received the same local isolated install/uninstall check. The app window was not launched during that check.

## CI

`.github/workflows/windows.yml` runs the TypeScript build and UI logic tests, Rust check/tests, builds Windows installers, and smoke-tests NSIS install/uninstall. It uploads build artifacts on main, pull requests and manual runs. Tagged `v*` builds attach unsigned installers to a private prerelease only after the repository has been created and GitHub authentication configured. The workflow never changes repository visibility.

## Update status and signing

There is no active updater, signing key, or private update endpoint. Keep the repository private. Before enabling updater artifacts, generate a key outside Git, store the private key/password only as protected GitHub Actions secrets, configure the public key in the app, and provide a private-test endpoint. Private GitHub Releases do not provide an unauthenticated updater feed. Public release remains an explicit product decision.
