$ErrorActionPreference = 'Stop'

$privateKeyPath = Join-Path $env:USERPROFILE '.tauri\PhasaForgeUpdater.key'
$passwordBlobPath = Join-Path $env:USERPROFILE '.tauri\PhasaForgeUpdaterPassword.dpapi'
if (-not (Test-Path -LiteralPath $privateKeyPath) -or -not (Test-Path -LiteralPath $passwordBlobPath)) {
    throw 'The local updater signing key is unavailable. See docs/UPDATES.md; do not put signing secrets in Git.'
}
if (-not (Test-Path -LiteralPath 'package.json')) {
    throw 'Run this script from the PhasaForge repository root.'
}

$securePassword = ConvertTo-SecureString (Get-Content -LiteralPath $passwordBlobPath -Raw)
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = $privateKeyPath
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $plainPassword
    & npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed with exit code $LASTEXITCODE." }
} finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $plainPassword = $null
    $securePassword.Dispose()
}
