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
    # 2. Proxy configuration (for official installer)
    # ---------------------------------------------------------------------------
    Write-Host ""
    Write-Host "  官方安装脚本需要访问 https://claude.ai" -ForegroundColor White
    Write-Host "  如果在国内环境，建议配置代理以提高成功率。" -ForegroundColor White
    Write-Host ""
    $useProxy = Read-Host "  是否配置代理？(y/N)"

    if ($useProxy -eq "y" -or $useProxy -eq "Y") {
        $proxyUrl = Read-Host "  请输入代理地址 [http://127.0.0.1:15236]"
        if ([string]::IsNullOrWhiteSpace($proxyUrl)) {
            $proxyUrl = "http://127.0.0.1:15236"
        }

        $env:HTTP_PROXY = $proxyUrl
        $env:HTTPS_PROXY = $proxyUrl
        Write-Ok "已设置代理: $proxyUrl"
    }

    # ---------------------------------------------------------------------------
    # 3. Install Claude Code CLI (official installer)
    # ---------------------------------------------------------------------------
    Write-Step "Installing Claude Code CLI..."

    $cliInstalled = $false

    # Try official installer
    try {
        Invoke-RestMethod https://claude.ai/install.ps1 -ErrorAction Stop | Invoke-Expression
        Write-Ok "Installed via official installer"
        $cliInstalled = $true
    } catch {
        Write-Warn "Official installer failed."

        # Try npm if available
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        if ($null -ne $npm) {
            Write-Host ""
            $useNpm = Read-Host "  是否尝试使用 npm 安装？(y/N)"

            if ($useNpm -eq "y" -or $useNpm -eq "Y") {
                try {
                    & npm install -g @anthropic-ai/claude-code
                    Write-Ok "Installed via npm"
                    $cliInstalled = $true
                } catch {
                    Write-Warn "npm installation also failed."
                }
            }
        }
    }

    # Check installation result
    if ($cliInstalled) {
        # Refresh PATH for the current session
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('Path', 'User')

        if (Test-Claude) {
            $ver = & claude --version 2>$null
            Write-Ok "Claude CLI installed successfully: $ver"
        } else {
            Write-Warn "Claude CLI installed but not in PATH. Please restart terminal."
        }
    } else {
        # CLI installation failed, offer to continue with Desktop only
        Write-Host ""
        Write-Warn "Claude CLI 自动安装失败。"
        Write-Host ""
        Write-Host "  可以先安装 CC Desktop，稍后手动安装 Claude CLI：" -ForegroundColor White
        Write-Host ""
        Write-Host "  【方式 1】使用代理 + 官方脚本（推荐）" -ForegroundColor Yellow
        Write-Host "    `$env:HTTPS_PROXY='http://your-proxy:port'" -ForegroundColor White
        Write-Host "    irm https://claude.ai/install.ps1 | iex" -ForegroundColor White
        Write-Host ""
        Write-Host "  【方式 2】使用 npm（需要 Node.js）" -ForegroundColor Yellow
        Write-Host "    npm install -g @anthropic-ai/claude-code" -ForegroundColor White
        Write-Host ""
        $continueDesktop = Read-Host "  是否继续仅安装 CC Desktop？(y/N)"

        if ($continueDesktop -ne "y" -and $continueDesktop -ne "Y") {
            Write-Host ""
            Write-Host "安装已取消。" -ForegroundColor Yellow
            exit 1
        }
    }
}

# ---------------------------------------------------------------------------
# 4. Find and launch CC Desktop installer
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
