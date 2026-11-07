@echo off
set "TARGET=%USERPROFILE%\.vscode\extensions\da7e-bot-1.0.1"
echo Installing Da7e Bot extension to %TARGET%...
if not exist "%TARGET%" mkdir "%TARGET%"
xcopy /E /I /Y "%~dp0*.*" "%TARGET%\" >nul
echo Installation complete! Please restart VS Code.
pause
