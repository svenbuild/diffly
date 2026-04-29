!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\Diffly" "" "Open with Diffly"
  WriteRegStr HKCU "Software\Classes\*\shell\Diffly" "Icon" "$INSTDIR\Diffly.exe"
  WriteRegStr HKCU "Software\Classes\*\shell\Diffly\command" "" '"$INSTDIR\Diffly.exe" --open-here "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\Diffly" "" "Open with Diffly"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Diffly" "Icon" "$INSTDIR\Diffly.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Diffly\command" "" '"$INSTDIR\Diffly.exe" --open-here "%1"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Diffly" "" "Open with Diffly"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Diffly" "Icon" "$INSTDIR\Diffly.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Diffly\command" "" '"$INSTDIR\Diffly.exe" --open-here "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Diffly"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Diffly"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Diffly"
!macroend
