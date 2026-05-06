@echo off
REM ZeroJarvis Desktop App Starter
REM Starts OpenCode + Gateway + Tauri Desktop (no browser needed)

echo.
echo   ======================================
echo        ZEROJARVIS - Desktop Mode
echo     Voice-First AI Personal Assistant
echo   ======================================
echo.

REM Add Rust/Cargo to PATH
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

REM Check Rust
where cargo >nul 2>&1
if errorlevel 1 (
    echo   [!] ERROR: cargo not found. Install Rust: https://rustup.rs
    pause
    exit /b 1
)

REM Check dependencies
if not exist "node_modules" (
    echo   [*] Installing dependencies...
    call pnpm install
)

REM Check .env
if not exist ".env" (
    echo   [!] Creating .env from template...
    copy .env.example .env
)

echo   [1/4] Starting OpenCode Server...
start "OpenCode Server" cmd /k "opencode serve --port 4096 --cors https://localhost:3000 --cors http://localhost:3100"
timeout /t 3 /nobreak >nul

echo   [2/4] Starting Voice Gateway...
start "ZeroJarvis Gateway" cmd /k "pnpm --filter @zerojarvis/gateway dev"
timeout /t 2 /nobreak >nul

echo   [3/4] Starting Web Server (backend for Tauri)...
start "ZeroJarvis Web" cmd /k "pnpm --filter @zerojarvis/web dev"
timeout /t 3 /nobreak >nul

echo   [4/4] Starting Desktop App...
start "ZeroJarvis Desktop" cmd /k "set PATH=%USERPROFILE%\.cargo\bin;%PATH% && pnpm --filter @zerojarvis/desktop dev"

echo.
echo   All services started!
echo   OpenCode: http://localhost:4096
echo   Gateway:  http://localhost:3100
echo   Desktop:  Tauri window (auto-opens)
echo.
echo   First time? Run "opencode" and use /connect to setup your LLM provider.
echo.
pause
