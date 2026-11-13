# PhasaForge 1.0.0 Windows testing release

This guide covers the 1.0.0 testing build. Obtain the NSIS setup executable, MSI, or standalone `PhasaForge.exe` from the release location provided to you, then compare its SHA-256 with the accompanying `SHA256SUMS.txt` before running it. Do not assume an artifact is available until its release has been published.

## What the installer includes

The installer contains the PhasaForge desktop app and its offline Thai dictionary. It is **not self-contained** for every optional provider:

- Windows 10/11 x64 and the Microsoft Edge WebView2 Runtime are required.
- Local MMS Thai speech needs Python 3.10 or later with `torch`, `transformers`, and `numpy`. Python and these packages are not bundled. PhasaForge uses CPU inference. If the intended Python is not found on `PATH`, set `PHASAFORGE_PYTHON` to its executable path before starting the app.
- The `facebook/mms-tts-tha` model is not bundled. If it is already cached, choosing MMS starts a local-only background preparation. A missing model shows Failed and does not trigger an automatic download. To install it, use **Settings → Download + test local Thai voice** after Python and its packages are available. That explicit action may access Hugging Face. The model is CC BY-NC 4.0 and is not suitable for commercial use under that license.
- Thai speech recognition is optional and is installed separately from Practice when the user first records and presses Stop; its runtime and model are not included in the installer.
- Azure Translator and Ollama are optional translation providers; neither key nor model is included.

The selected MMS model is loaded only when MMS is selected. Automatic startup warm-up makes no network request; it runs only from the local model cache. The worker stays resident while the window is hidden and stops when PhasaForge exits.

## First-run translation setup

Choose one provider in **Settings → Translation provider**:

- **Azure Translator:** Create your own Azure Translator resource. Enter its key in the password field and enter the resource region shown on Azure's Keys and Endpoint page. The key and region are saved in Windows Credential Manager for the current Windows account, not in app settings, the database, or logs. A blank region is valid only for a global Translator resource; regional and multi-service resources require their region. Microsoft documents these header rules in its [Translator authentication reference](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication). Thai text is sent to Microsoft's Translator service when Azure is selected and a new translation is requested. Usage and charges follow the user's Azure resource and plan; PhasaForge's local monthly safety cap is 1.9 million UTF-16 characters.
- **Offline examples:** Uses bundled dictionary data and attributed examples without network requests. It does not generate new sentence translations.
- **Local Ollama:** Install and run Ollama, install a translation model, select a model PhasaForge finds in the running local service, then Save. Requests go to the local Ollama endpoint; downloading a model requires an explicit user action.

If this Windows account has no Azure key saved, PhasaForge reports that state and will not read another Windows account's credentials. Select Offline or Local Ollama, or enter your own Azure key and region. An HTTP 401 or 403 from Azure is reported as a key-or-region error in Settings; PhasaForge does not silently substitute another account's credential. Azure availability and credential error handling still require first-run acceptance on a clean Windows profile; see the [acceptance record](ACCEPTANCE_TESTS.md#version-100--deployment-acceptance).

## Data and uninstall

Settings, the cached dictionary and corrections, translation cache, recordings, diagnostic log, and MMS model cache live in the current Windows user's application-data folder (`%APPDATA%\net.dia.phasaforge`). Windows Credential Manager holds the Azure key and region per account. App data and credentials are separate from the installer. Reinstall using the same Windows account; consult the acceptance record for which data-retention and startup checks were verified. Do not use **Clear History** unless you intend to delete recordings.

The optional Windows sign-in setting is off by default. When enabled, it registers the installed executable for the current Windows account. Reinstall from the same installer channel and installation scope to retain that setting; the release acceptance record states whether both uninstallers removed an obsolete registration.

See [Known limitations](ACCEPTANCE_TESTS.md#version-100--deployment-acceptance) and [update signing](UPDATES.md).
