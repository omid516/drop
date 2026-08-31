@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto no_node
node launcher.mjs
goto finished
:no_node
echo Node.js 22 or newer is required.
echo Download it from https://nodejs.org/
:finished
echo.
echo Press any key to close this window...
pause >nul
