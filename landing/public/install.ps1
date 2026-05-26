# ============================================================
# Zyphron CLI — Windows PowerShell installer
# Usage: irm https://zyphron.space/install.ps1 | iex
# ============================================================
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Zyphron CLI Installer" -ForegroundColor Magenta
Write-Host ""

$installDir = "$env:LOCALAPPDATA\zyphron\bin"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$binaryUrl = "https://zyphron.space/releases/zyphron-win-$arch.exe"
$binaryPath = "$installDir\zyphron.exe"

Write-Host "  Downloading zyphron-win-$arch.exe ..." -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri $binaryUrl -OutFile $binaryPath -UseBasicParsing
    Write-Host "  Downloaded successfully" -ForegroundColor Green
} catch {
    # Fallback to npm
    Write-Host "  Native binary not available, trying npm..." -ForegroundColor Yellow
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  Node.js is required. Install from https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    npm install -g https://zyphron.space/zyphron-cli.tgz
    Write-Host "  Installed via npm" -ForegroundColor Green
    exit 0
}

# Add to PATH for current user
$currentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$installDir*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$currentPath;$installDir", "User")
    Write-Host "  Added $installDir to PATH" -ForegroundColor Cyan
    Write-Host "  Restart your terminal for PATH changes to take effect" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Zyphron CLI installed!" -ForegroundColor Green
Write-Host ""
Write-Host "  Quick start:" -ForegroundColor DarkGray
Write-Host "    zyphron login" -ForegroundColor Magenta
Write-Host "    zyphron deploy <github-url>" -ForegroundColor Magenta
Write-Host ""
