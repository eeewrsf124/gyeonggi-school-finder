@echo off
setlocal

set "ROOT=%~dp0"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" goto open
set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto open
set "CHROME=chrome.exe"

:open
start "" "%CHROME%" "%ROOT%index.html"

endlocal
