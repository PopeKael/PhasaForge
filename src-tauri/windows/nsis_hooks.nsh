!macro NSIS_HOOK_PREUNINSTALL
  ; Remove only PhasaForge's per-user autostart entries.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PhasaForge"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "PhasaForge"
!macroend
