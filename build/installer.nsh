; MAVE installer additions (electron-builder NSIS include).

; Stop Mave's own helper processes so their files aren't locked. Matched by path, so an
; unrelated llama-server the user runs elsewhere is never touched.
!macro stopMaveHelpers
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "Get-Process input-helper,llama-server,whisper-server,piper,mave-worker -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '*\Mave\*' -or $$_.Path -like '*\Bigfoot\*' } | Stop-Process -Force"`
  Pop $0
!macroend

!macro preInit
  !insertmacro stopMaveHelpers
!macroend

!macro customUnInit
  !insertmacro stopMaveHelpers
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; "Open Mave when I sign in" would otherwise point at a missing app.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.mave.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.mave.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.bigfoot.app"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.bigfoot.app"
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your MAVE settings, memory, and the downloaded AI models?$\r$\n$\r$\nThe models can take several gigabytes. Keep them if you plan to install MAVE again, so you don't have to download them twice." /SD IDNO IDNO mave_keep_data
      RMDir /r "$APPDATA\Mave"
      RMDir /r "$APPDATA\Bigfoot"
    mave_keep_data:
  ${endIf}
!macroend
