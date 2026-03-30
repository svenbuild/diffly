!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\DifflyOpenHere" "" "Open Diffly here"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\DifflyOpenHere" "Icon" "$INSTDIR\Diffly.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\DifflyOpenHere\command" "" "$\"$INSTDIR\Diffly.exe$\" --open-here $\"%V$\""
  WriteRegStr HKCU "Software\Classes\Directory\shell\DifflyOpenHere" "" "Open Diffly here"
  WriteRegStr HKCU "Software\Classes\Directory\shell\DifflyOpenHere" "Icon" "$INSTDIR\Diffly.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\DifflyOpenHere\command" "" "$\"$INSTDIR\Diffly.exe$\" --open-here $\"%1$\""
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\DifflyOpenHere"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\DifflyOpenHere"
!macroend
