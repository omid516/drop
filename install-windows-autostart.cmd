@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Drop Local Share.lnk');$s.TargetPath='%SystemRoot%\System32\wscript.exe';$s.Arguments=[char]34+'%~dp0run-hidden-windows.vbs'+[char]34;$s.WorkingDirectory='%~dp0';$s.Save()"
if errorlevel 1 (
  echo Installation failed.
  pause
  exit /b 1
)
echo Drop will now start automatically after Windows sign-in.
echo You can close this window.
pause
