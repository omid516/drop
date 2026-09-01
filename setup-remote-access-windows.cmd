@echo off
setlocal
cd /d "%~dp0"
net session >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo DROP - Secure remote access setup
echo.
where tailscale.exe >nul 2>nul
if errorlevel 1 (
  echo Installing Tailscale...
  winget install --id Tailscale.Tailscale --exact --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto install_failed
)
set "TS_EXE=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS_EXE%" set "TS_EXE=tailscale.exe"
echo Connecting this computer to Tailscale...
"%TS_EXE%" up --hostname=drop-office
if errorlevel 1 goto connect_failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$path=if(Test-Path -LiteralPath '%~dp0config.json'){'%~dp0config.json'}else{'%~dp0config.example.json'};$cfg=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;$port=if($cfg.port){[int]$cfg.port}else{8088};Get-NetFirewallRule -DisplayName 'Drop via Tailscale' -ErrorAction SilentlyContinue|Remove-NetFirewallRule;New-NetFirewallRule -DisplayName 'Drop via Tailscale' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -RemoteAddress '100.64.0.0/10' -Profile Any|Out-Null"
echo.
echo Remote access is ready.
call "%~dp0remote-access-status.cmd"
exit /b
:install_failed
echo Tailscale installation failed. Check your internet connection and Winget.
pause
exit /b 1
:connect_failed
echo Tailscale sign-in was not completed.
pause
exit /b 1
