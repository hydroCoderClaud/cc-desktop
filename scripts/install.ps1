#Requires -Version 5.1
<#
.SYNOPSIS
    CC Desktop installer for Windows.
.DESCRIPTION
    Detects Claude Code CLI, installs it if missing, then launches
    the CC Desktop .exe installer found in the same directory.
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
# 1. Detect Claude Code CLI
# ---------------------------------------------------------------------------
Write-Step "Detecting Claude Code CLI..."

function Test-Claude {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    return $null -ne $cmd
}

if (Test-Claude) {
    $ver = & claude --version 2>$null
    Write-Ok "Claude CLI found: $ver"
} else {
    Write-Warn "Claude CLI not found. Installing..."

    # ---------------------------------------------------------------------------
    # 2. Install Claude Code CLI (official installer)
    # ---------------------------------------------------------------------------
    Write-Step "Installing Claude Code CLI..."
    try {
        Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
    } catch {
        Write-Err "Failed to install Claude CLI: $_"
        Write-Host ""
        Write-Host "Please install manually:" -ForegroundColor Yellow
        Write-Host "  irm https://claude.ai/install.ps1 | iex" -ForegroundColor White
        Write-Host ""
        exit 1
    }

    # Refresh PATH for the current session
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (Test-Claude) {
        $ver = & claude --version 2>$null
        Write-Ok "Claude CLI installed successfully: $ver"
    } else {
        Write-Err "Claude CLI installation succeeded but 'claude' is not in PATH."
        Write-Host "  Please restart your terminal and try again." -ForegroundColor Yellow
        exit 1
    }
}

# ---------------------------------------------------------------------------
# 3. Find and launch CC Desktop installer
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
