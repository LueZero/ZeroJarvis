#!/usr/bin/env pwsh
# ZeroJarvis Quick Start Script
# Usage: .\start.ps1 [all|gateway|web|opencode]

param(
    [ValidateSet("gateway", "web", "opencode", "all")]
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║       ZEROJARVIS — Jarvis v0.1       ║" -ForegroundColor Cyan
Write-Host "  ║    Voice-First AI Personal Assistant  ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# --- Pre-checks ---
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
    Write-Host "  📖 https://opencode.ai/docs/zh-tw" -ForegroundColor Yellow
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
    Write-Host "  📝 Please edit .env if needed" -ForegroundColor Yellow
    Write-Host ""
}

# --- Start services ---
Write-Host "  🚀 Starting services ($Mode)..." -ForegroundColor Green
Write-Host ""

$step = 1
$total = if ($Mode -eq "all") { 3 } elseif ($Mode -eq "opencode") { 1 } else { 1 }

if ($Mode -eq "opencode" -or $Mode -eq "all") {
    Write-Host "  [$step/$total] OpenCode Server → http://localhost:4096" -ForegroundColor Magenta
    Start-Process -FilePath "opencode" -ArgumentList "serve --port 4096 --cors https://localhost:3000 --cors http://localhost:3100" -WorkingDirectory $Root -WindowStyle Normal
    Start-Sleep -Seconds 3
    $step++
}

if ($Mode -eq "gateway" -or $Mode -eq "all") {
    Write-Host "  [$step/$total] Voice Gateway   → http://localhost:3100" -ForegroundColor Cyan
    Start-Process -FilePath "pnpm" -ArgumentList "--filter @zerojarvis/gateway dev" -WorkingDirectory $Root -WindowStyle Normal
    Start-Sleep -Seconds 2
    $step++
}

if ($Mode -eq "web" -or $Mode -eq "all") {
    Write-Host "  [$step/$total] Web UI          → https://localhost:3000" -ForegroundColor Cyan
    Start-Process -FilePath "pnpm" -ArgumentList "--filter @zerojarvis/web dev" -WorkingDirectory $Root -WindowStyle Normal
    Start-Sleep -Seconds 2
    $step++
}

Write-Host ""
Write-Host "  ✅ All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor DarkGray
Write-Host "  │  🧠 OpenCode:  http://localhost:4096         │" -ForegroundColor DarkGray
Write-Host "  │  🔌 Gateway:   http://localhost:3100         │" -ForegroundColor DarkGray
Write-Host "  │  🌐 Web UI:    https://localhost:3000        │" -ForegroundColor DarkGray
Write-Host "  │  📖 API Docs:  http://localhost:4096/doc     │" -ForegroundColor DarkGray
Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  💡 先用 opencode 設定 LLM provider（/connect）" -ForegroundColor Yellow
Write-Host "  💡 然後開 http://localhost:3000 跟 Jarvis 說話" -ForegroundColor Yellow
Write-Host ""
