#!/usr/bin/env pwsh
# ZeroJarvis Desktop Quick Start Script
# Usage: .\start-desktop.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║    ZEROJARVIS — Desktop Mode v0.1    ║" -ForegroundColor Cyan
Write-Host "  ║    Voice-First AI Personal Assistant  ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# --- Pre-checks ---
# Ensure Rust/Cargo is in PATH (rustup default location)
$cargoPath = "$env:USERPROFILE\.cargo\bin"
if ((Test-Path $cargoPath) -and ($env:PATH -notlike "*$cargoPath*")) {
    $env:PATH = "$cargoPath;$env:PATH"
}

function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "pnpm")) {
    Write-Host "  ❌ pnpm not found. Install: npm i -g pnpm" -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "bun")) {
    Write-Host "  ❌ bun not found. Install: https://bun.sh" -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "opencode")) {
    Write-Host "  ❌ opencode not found. Install: npm i -g opencode-ai" -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "cargo")) {
    Write-Host "  ❌ Rust/Cargo not found. Install: https://rustup.rs" -ForegroundColor Red
    exit 1
}

# --- Check dependencies ---
if (-not (Test-Path "$Root\node_modules")) {
    Write-Host "  📦 Installing dependencies..." -ForegroundColor Yellow
    Push-Location $Root
    pnpm install
    Pop-Location
}

# --- Check .env ---
if (-not (Test-Path "$Root\.env")) {
    Write-Host "  ⚠️  .env not found, creating from .env.example..." -ForegroundColor Yellow
    Copy-Item "$Root\.env.example" "$Root\.env"
    Write-Host "  📝 Please edit .env and set GROQ_API_KEY" -ForegroundColor Yellow
    Write-Host ""
}

# --- Start services ---
Write-Host "  🚀 Starting Desktop mode..." -ForegroundColor Green
Write-Host ""

Write-Host "  [1/4] OpenCode Server → http://localhost:4096" -ForegroundColor Magenta
Start-Process -FilePath "opencode" -ArgumentList "serve --port 4096 --cors https://localhost:3000 --cors http://localhost:3100" -WorkingDirectory $Root -WindowStyle Normal
Start-Sleep -Seconds 3

Write-Host "  [2/4] Voice Gateway   → http://localhost:3100" -ForegroundColor Cyan
Start-Process -FilePath "pnpm" -ArgumentList "--filter @zerojarvis/gateway dev" -WorkingDirectory $Root -WindowStyle Normal
Start-Sleep -Seconds 2

Write-Host "  [3/4] Web Server      → https://localhost:3000" -ForegroundColor Cyan
Start-Process -FilePath "pnpm" -ArgumentList "--filter @zerojarvis/web dev" -WorkingDirectory $Root -WindowStyle Normal
Start-Sleep -Seconds 3

Write-Host "  [4/4] Desktop App     → Tauri window" -ForegroundColor Green
Start-Process -FilePath "pnpm" -ArgumentList "--filter @zerojarvis/desktop dev" -WorkingDirectory $Root -WindowStyle Normal

Write-Host ""
Write-Host "  ✅ Desktop app launching!" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor DarkGray
Write-Host "  │  🧠 OpenCode:  http://localhost:4096         │" -ForegroundColor DarkGray
Write-Host "  │  🔌 Gateway:   http://localhost:3100         │" -ForegroundColor DarkGray
Write-Host "  │  🖥️  Desktop:   Tauri (auto-opens)           │" -ForegroundColor DarkGray
Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  💡 First build takes a few minutes (Rust compilation)" -ForegroundColor Yellow
Write-Host "  💡 Ctrl+Space = Wake Jarvis from background" -ForegroundColor Yellow
Write-Host ""
