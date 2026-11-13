# Build and release

## Windows build

Build on Windows 10 or 11 x64 with the Rust MSVC toolchain, Node.js/npm, Microsoft C++ Build Tools, and WebView2 available.

```powershell
npm ci
npm run build
npm run test:ui
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --no-bundle
```

Use the Tauri CLI for the standalone executable. It runs the production frontend build and embeds `../dist`. A raw `cargo build --release` does not run that frontend step and is not a release artifact.

The learner database builder verifies the pinned source checksums before rebuilding `assets/learner.sqlite`. The learner data is separately licensed from the MIT application source; review the notices under `reference-data/` before changing or redistributing it.

## Signed packages

Run `./scripts/build-signed-release.ps1` from the repository root to build the standalone executable, NSIS and MSI packages, and signed Tauri update bundles. The private updater key and DPAPI-protected passphrase must already exist under `%USERPROFILE%\.tauri\` on the release workstation. The script never prints either secret. Do not commit keys, passphrases, `.sig` files for private local test keys, or credential dumps.

The installers do not bundle Python, PyTorch, Transformers, NumPy, or model weights. See [installation prerequisites](INSTALLATION.md) and [dependency inventory](DEPENDENCIES.md).

## Installed acceptance

Test each release candidate from the executable or installer built for that exact commit. Verify the installed version, first launch, saved settings, Azure setup, cached dictionary and translations, recordings, optional model readiness, sign-in startup, uninstall cleanup, and data retention across reinstall. Keep results in [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md); clearly distinguish source or unit-test evidence from live installation evidence.

Use the signed local artifacts for listening and visual review. Create a SHA-256 manifest from the exact files offered to testers. Never publish a package that has not passed the acceptance checks claimed in its release notes.

## CI

`.github/workflows/windows.yml` runs UI and Rust checks, builds Windows installers with the updater-artifact CI override, and smoke-tests the NSIS install/uninstall path. CI artifacts are uploaded only after every step passes. CI does not create a GitHub release, sign production packages, or change repository visibility.

## Autostart

The Windows sign-in option uses the Tauri autostart plugin, is scoped to the current Windows account, and defaults off for new users. It registers the executable only when the saved checkbox differs from the current setting. Moving an executable after enabling autostart may require toggling the checkbox again so Windows records the new path. Both installer configurations target only the PhasaForge `Run` and `StartupApproved\Run` values during uninstall; do not replace this with deletion of the whole Windows startup registry key.

## Updates

Version 1.0.0 includes Tauri updater configuration and a signing foundation, but does not check for, download, or install updates. The private signing key stays outside Git. See [UPDATES.md](UPDATES.md) for the remaining requirements before a 1.0.0 → 1.0.1 test.
