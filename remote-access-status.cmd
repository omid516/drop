@echo off
setlocal
cd /d "%~dp0"
set "TS_EXE=%ProgramFiles%\Tailscale\tailscale.exe"
if not exist "%TS_EXE%" set "TS_EXE=tailscale.exe"
where "%TS_EXE%" >nul 2>nul
if errorlevel 1 (
  echo Tailscale is not installed.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "$path=if(Test-Path -LiteralPath '%~dp0config.json'){'%~dp0config.json'}else{'%~dp0config.example.json'};$cfg=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json;if($cfg.port){$cfg.port}else{8088}"`) do set "DROP_PORT=%%P"
for /f "delims=" %%I in ('"%TS_EXE%" ip -4') do set "TS_IP=%%I"
for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -Command "$j=(& '%TS_EXE%' status --json|ConvertFrom-Json);$j.Self.DNSName.TrimEnd('.')"`) do set "TS_DNS=%%D"
echo.
echo Drop remote addresses:
echo   http://drop-office:%DROP_PORT%
if defined TS_DNS echo   http://%TS_DNS%:%DROP_PORT%
if defined TS_IP echo   http://%TS_IP%:%DROP_PORT%
echo.
echo Tailscale status:
"%TS_EXE%" status
echo.
pause
