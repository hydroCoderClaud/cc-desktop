!macro customHeader
  ManifestDPIAware true
  !ifndef BUILD_UNINSTALLER
    !searchreplace InstallerDisplayNameEscaped "JSHP Desktop" "&" "&&"
    BrandingText "JSHP Desktop ${VERSION}"
    Caption "JSHP Desktop 安装"
    Name "JSHP Desktop" "${InstallerDisplayNameEscaped}"
  !endif
!macroend

!macro customInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${if} ${FileExists} "$newStartMenuLink"
      Delete "$newStartMenuLink"
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${endif}
  !endif

  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    ${ifNot} ${isNoDesktopShortcut}
      ${if} ${FileExists} "$newDesktopLink"
        Delete "$newDesktopLink"
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      ${endif}
    ${endif}
  !endif

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
