@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=[Environment]::GetFolderPath('Startup')+'\Drop Local Share.lnk';if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}"
echo Automatic startup has been removed.
pause
