@echo off
REM ZeroJarvis Quick Start (Windows batch)
REM Starts OpenCode + Gateway + Web UI in separate terminals

echo.
echo   ======================================
echo        ZEROJARVIS - Jarvis v0.1
echo     Voice-First AI Personal Assistant
echo   ======================================
echo.

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

echo   [1/3] Starting OpenCode Server...
start "OpenCode Server" cmd /k "opencode serve --port 4096 --cors https://localhost:3000 --cors http://localhost:3100"
timeout /t 3 /nobreak >nul

echo   [2/3] Starting Voice Gateway...
start "ZeroJarvis Gateway" cmd /k "pnpm --filter @zerojarvis/gateway dev"
timeout /t 2 /nobreak >nul

echo   [3/3] Starting Web UI...
start "ZeroJarvis Web" cmd /k "pnpm --filter @zerojarvis/web dev"
timeout /t 2 /nobreak >nul

echo.
echo   All services started!
echo   OpenCode: http://localhost:4096
echo   Gateway:  http://localhost:3100
  echo   Web UI:   https://localhost:3000 (HTTPS)
echo.
echo   First time? Run "opencode" and use /connect to setup your LLM provider.
echo   Then open http://localhost:3000 in your browser.
echo.
pause
