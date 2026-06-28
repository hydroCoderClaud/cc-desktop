#Requires -Version 5.1
<#
.SYNOPSIS
    CC Desktop installer for Windows.
.DESCRIPTION
    Launches the CC Desktop .exe installer found in the same directory.
.NOTES
    Run: powershell -ExecutionPolicy Bypass -File .\install.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "`n>> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "   [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "   [!] $Message" -ForegroundColor Yellow }
function Write-Err  { param([string]$Message) Write-Host "   [ERROR] $Message" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 1. Check Node.js (required for Agent mode)
# ---------------------------------------------------------------------------
Write-Step "Checking Node.js..."

$nodeAvailable = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

if ($null -ne $nodeCmd) {
    $nodeAvailable = $true
    $nodeVer = & node --version 2>$null
    Write-Ok "Node.js found: $nodeVer"
} else {
    Write-Warn "Node.js not found"
    Write-Host ""
    Write-Host "  📌 Node.js 依赖说明：" -ForegroundColor White
    Write-Host "    • Terminal 模式：不需要（可正常使用）" -ForegroundColor White
    Write-Host "    • Agent 模式：必需（需要系统 Node.js 环境）" -ForegroundColor White
    Write-Host ""
    $installNode = Read-Host "  是否现在安装 Node.js？(y/N)"

    if ($installNode -eq "y" -or $installNode -eq "Y") {
        # Check if winget is available
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($null -ne $winget) {
            Write-Step "Installing Node.js via winget..."
            try {
                & winget install OpenJS.NodeJS.LTS
                $nodeAvailable = $true
                # Refresh PATH
                $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                            [System.Environment]::GetEnvironmentVariable('Path', 'User')
                $nodeVer = & node --version 2>$null
                Write-Ok "Node.js installed: $nodeVer"
            } catch {
                Write-Err "Failed to install Node.js via winget"
            }
        } else {
            Write-Warn "winget not found"
            Write-Host ""
            Write-Host "  请手动安装 Node.js：" -ForegroundColor White
            Write-Host "    下载地址: https://nodejs.org/" -ForegroundColor White
            Write-Host ""
            Write-Host "  安装完成后重新运行此脚本以启用 Agent 模式" -ForegroundColor White
        }
    }

    if (-not $nodeAvailable) {
        Write-Warn "继续安装（Agent 模式将不可用）"
        Write-Host ""
    }
}

# ---------------------------------------------------------------------------
# 2. Find and launch CC Desktop installer
# ---------------------------------------------------------------------------
Write-Step "Looking for CC Desktop installer..."

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$installers = @(Get-ChildItem -Path $scriptDir -Filter '*.exe' |
    Where-Object { $_.Name -match '(?i)cc[-\s]?desktop' } |
    Sort-Object LastWriteTime -Descending)

if ($installers.Count -eq 0) {
    # Also check parent directory (scripts/ is inside the release folder)
    $parentDir = Split-Path -Parent $scriptDir
    $installers = @(Get-ChildItem -Path $parentDir -Filter '*.exe' |
        Where-Object { $_.Name -match '(?i)cc[-\s]?desktop' } |
        Sort-Object LastWriteTime -Descending)
}

if ($installers.Count -gt 0) {
    $installer = $installers[0].FullName
    Write-Ok "Found installer: $($installers[0].Name)"
    Write-Step "Launching CC Desktop installer..."
    Start-Process -FilePath $installer
    Write-Ok "Installer launched. Follow the on-screen instructions."
} else {
    Write-Warn "No CC Desktop installer (.exe) found in the current directory."
    Write-Host "  Please download it from the releases page and run it manually." -ForegroundColor Yellow
}

Write-Host "`nDone." -ForegroundColor Cyan
