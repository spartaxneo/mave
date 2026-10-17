@echo off
:: Mave Administrator Elevation Launcher
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] Running with elevated Administrator privileges.
    cd /d "%~dp0"
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
) else (
    echo [INFO] Requesting Administrator elevation...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb runAs"
)
