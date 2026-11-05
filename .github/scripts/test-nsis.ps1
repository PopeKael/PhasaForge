# Smoke-test the actual current-user NSIS installer on a clean Windows CI runner.
# A successful Tauri bundle alone is not acceptance. This test intentionally fails
# if no installed executable or no uninstall registration is produced.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$bundleDir = Join-Path $repoRoot 'src-tauri\target\release\bundle\nsis'
$installer = Get-ChildItem -LiteralPath $bundleDir -File -Filter '*-setup.exe' |
  Where-Object { $_.Name -like 'PhasaForge*' } |
  Select-Object -First 1
if (-not $installer) { throw "No PhasaForge NSIS installer found in $bundleDir" }

Write-Host "Installing $($installer.Name) silently for the current user."
$installProcess = Start-Process -FilePath $installer.FullName -ArgumentList '/S' -Wait -PassThru
Write-Host "Installer exit code: $($installProcess.ExitCode)"
if ($installProcess.ExitCode -ne 0) { throw "NSIS installer failed: $($installProcess.ExitCode)" }

$uninstallKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$entries = @(Get-ChildItem -Path $uninstallKeyPath | ForEach-Object {
  Get-ItemProperty -LiteralPath $_.PSPath
} | Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like 'PhasaForge*' })
if ($entries.Count -ne 1) {
  throw "Expected exactly one current-user PhasaForge uninstall entry, found $($entries.Count)."
}
$entry = $entries[0]
Write-Host "Registered app: $($entry.DisplayName)"
if ($entry.PSObject.Properties['InstallLocation']) { Write-Host "InstallLocation: $($entry.InstallLocation)" } else { Write-Host 'InstallLocation: (not recorded)' }

$locations = @()
if ($entry.PSObject.Properties['InstallLocation'] -and $entry.InstallLocation) {
  # NSIS writes InstallLocation as a quoted string in this app's uninstall
  # registration. Remove wrapping quotes before passing it to Join-Path.
  $registeredLocation = ([string]$entry.InstallLocation).Trim().Trim('"')
  if ($registeredLocation) { $locations += $registeredLocation }
}
$locations += (Join-Path $env:LOCALAPPDATA 'PhasaForge')
$installedExe = $null
foreach ($dir in $locations) {
  $candidate = Join-Path $dir 'PhasaForge.exe'
  if (Test-Path -LiteralPath $candidate -PathType Leaf) {
    $installedExe = $candidate
    break
  }
}
if (-not $installedExe) {
  throw "Installer returned success but PhasaForge.exe is missing from registered/default install paths."
}
Write-Host "Installed executable: $installedExe"

$uninstaller = $null
if ($entry.PSObject.Properties['UninstallString'] -and $entry.UninstallString) {
  $uninstallCommand = [string]$entry.UninstallString
  if ($uninstallCommand -match '^"([^"]+\.exe)"') {
    $uninstaller = $Matches[1]
  } elseif ($uninstallCommand -match '^(.+?\.exe)(?:\s|$)') {
    $uninstaller = $Matches[1]
  }
}
if (-not $uninstaller -or -not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
  $uninstaller = Get-ChildItem -LiteralPath (Split-Path $installedExe -Parent) -File -Filter '*uninstall*.exe' |
    Select-Object -ExpandProperty FullName -First 1
}
if (-not $uninstaller -or -not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
  throw "Installation exists but no usable NSIS uninstaller was found."
}
Write-Host "Uninstalling through $uninstaller"
$uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
Write-Host "Uninstaller exit code: $($uninstallProcess.ExitCode)"
if ($uninstallProcess.ExitCode -ne 0) { throw "NSIS uninstaller failed: $($uninstallProcess.ExitCode)" }
Start-Sleep -Seconds 3

if (Test-Path -LiteralPath $installedExe -PathType Leaf) {
  throw "Uninstall returned success but the application executable remains installed."
}
$remaining = @(Get-ChildItem -Path $uninstallKeyPath | ForEach-Object {
  Get-ItemProperty -LiteralPath $_.PSPath
} | Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like 'PhasaForge*' })
if ($remaining.Count -gt 0) {
  throw "Uninstall returned success but the current-user uninstall entry remains."
}
Write-Host 'PASS: NSIS installer registered and installed PhasaForge.exe; uninstaller removed both.'
