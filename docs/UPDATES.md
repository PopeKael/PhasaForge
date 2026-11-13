# Tauri signed updates

PhasaForge 1.0.0 includes the Tauri updater Rust and JavaScript packages, the public verification key, HTTPS endpoint configuration, and signed-artifact build support. The app does **not** call the updater API, check on launch, download an update, or install one in 1.0.0. Installation remains manual for this testing release.

## Signing key storage

- The public key is committed in `src-tauri/tauri.conf.json`; publishing it is safe.
- The encrypted private key and DPAPI-protected passphrase are stored outside the repository under `%USERPROFILE%\.tauri\` on the release workstation. The password blob can be decrypted only by this Windows account on this machine.
- `scripts/build-signed-release.ps1` reads those files into the build process and clears the signing environment variables afterward. It prints neither key nor passphrase. Keep both files out of Git, logs, screenshots, and support attachments.
- This is a workstation-only copy, not a recoverable team key store. Before relying on updates, make a separate encrypted backup under the user's control. Losing the private key means future packages cannot update installations that trust this public key.
- Tauri updater signatures verify update bundle integrity and origin. They are separate from Authenticode signing; these installers are not claimed to carry a Windows publisher certificate.

## Requirements before testing 1.0.0 → 1.0.1

1. Keep the same updater private/public key pair and increase the app version to `1.0.1`.
2. Build the NSIS updater bundle and its `.sig` file with the protected key. The MSI updater bundle is available too, but first test one installer channel and installation scope consistently.
3. Publish the signed updater bundle and `.sig`, then publish a valid `latest.json` containing SemVer `1.0.1`, an HTTPS asset URL, and the **signature file contents** for the matching Windows target. A signature URL is not accepted in place of the signature text.
4. Make the configured endpoint accessible to the intended test installation. The current endpoint is GitHub's latest-release asset URL, which resolves only to a published full release; GitHub does not let a prerelease become `latest`. To test a prerelease 1.0.1, version 1.0.0 needs a reachable endpoint that serves the explicit 1.0.1 manifest. If the GitHub repository/release is private, ordinary updater requests cannot fetch those assets anonymously; use an authenticated update server or a publicly reachable static manifest and signed assets. Never embed a GitHub personal access token in PhasaForge.
5. Add or enable an explicit update-check/install action only for the test build, with the updater permission in the Tauri capability. Verify signature rejection for a deliberately mismatched artifact, then install 1.0.1 over 1.0.0 and confirm settings, Credential Manager values, dictionary/corrections, translation cache, recordings and MMS cache remain intact.
6. Test update failure/cancel behavior and relaunch. Preserve the 1.0.0 installer so the test can be repeated from a clean install.

Tauri's [official updater guide](https://v2.tauri.app/plugin/updater/) documents signing, the static manifest fields, Windows updater bundles, and the requirement that the manifest embed the generated signature contents. Tauri's [configuration extension guide](https://v2.tauri.app/develop/configuration-files/) documents the CI override that builds unsigned test installers without publishing them as releases.
