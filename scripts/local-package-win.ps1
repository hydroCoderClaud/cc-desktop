$ErrorActionPreference = "Stop"

$VERSION = (Get-Content package.json | ConvertFrom-Json).version
$RELEASE_DIR = "cc-desktop-${VERSION}-windows"
$OUTPUT = "dist\cc-desktop-${VERSION}-windows.zip"

Write-Host "Packaging Windows installer: ${OUTPUT}..."

New-Item -ItemType Directory -Force -Path $RELEASE_DIR | Out-Null

$exeFile = Get-ChildItem -Path dist -Filter "*.exe" | Select-Object -First 1
if ($exeFile) {
    Copy-Item $exeFile.FullName "$RELEASE_DIR\CC Desktop Setup ${VERSION}.exe"
} else {
    Write-Error "No .exe file found in dist/"
    exit 1
}
Copy-Item "scripts\install.ps1" "$RELEASE_DIR\"

@"
# CC Desktop ${VERSION} - Windows Installer

## Quick Install (Recommended)

Right-click PowerShell and "Run as Administrator", then:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

This will:
1. Check if Claude Code CLI is installed (install if not)
2. Launch CC Desktop installer

## Manual Install

Double-click ``CC Desktop Setup ${VERSION}.exe``
"@ | Out-File -FilePath "$RELEASE_DIR\README.md" -Encoding UTF8

Compress-Archive -Path $RELEASE_DIR -DestinationPath $OUTPUT -Force
Remove-Item -Recurse -Force $RELEASE_DIR

Write-Host "Done: ${OUTPUT}"
