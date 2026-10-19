@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 is required.
  pause
  exit /b 1
)
node scripts\admin-server.mjs --open
if errorlevel 1 pause
