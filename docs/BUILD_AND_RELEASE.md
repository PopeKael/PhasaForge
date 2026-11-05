# Build and release

## Local Windows build

Required: Windows 11 x64, stable Rust MSVC toolchain, Node.js/npm, Microsoft C++ Build Tools, and WebView2. See the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm install
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Tauri's Windows bundler supports MSI and NSIS installers; this project selects both. Output is under `src-tauri/target/release/bundle/`.

## CI

`.github/workflows/windows.yml` builds and uploads Windows installer artifacts on pushes and pull requests. Tagged `v*` builds attach installers to a GitHub prerelease only after the repository has been created and GitHub authentication configured. The workflow never changes repository visibility.

## Update status and signing

There is no active updater in 0.1.0. The repository has no signing key and no configured private update endpoint. Keep the repository private. Before enabling Tauri updater artifacts, generate a key outside Git, store the private key and password only as protected GitHub Actions secrets, configure the public key in the app, and provide a private-test endpoint accessible to intended users. Private GitHub Releases do not provide an unauthenticated updater feed. Public release remains an explicit product decision.

The current workflow creates unsigned test installers. Do not describe them as production signed releases or as exercising the update process.
