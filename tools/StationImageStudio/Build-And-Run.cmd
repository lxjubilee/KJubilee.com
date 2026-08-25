@echo off
REM Build and launch Station Image Studio (WPF + WebView2).
setlocal
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 ( echo [!] The .NET SDK is required ^(dotnet^). Install from https://dotnet.microsoft.com & pause & exit /b 1 )

REM Output goes to a -v2 folder, not the default net8.0-windows. W: is a mapped
REM share (\HDC-INSPIRESERVER\Websites) and an exe there can end up answering
REM "access is denied" to every write, even with an elevated shell and no process
REM holding it. Building beside it costs a folder and sidesteps it entirely.
echo [*] Building...
dotnet build -c Release -o "bin\Release\net8.0-windows-v2"
if errorlevel 1 ( echo [!] Build failed. & pause & exit /b 1 )

echo [*] Launching...
start "" "bin\Release\net8.0-windows-v2\StationImageStudio.exe"
endlocal
