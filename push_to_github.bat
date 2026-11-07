@echo off
set "PATH=C:\Program Files\Git\cmd;%PATH%"
cd /d "C:\Users\janah\OneDrive\Desktop\extintion"
echo ========================================================
echo  Pushing Da7e Bot and APK build workflow to GitHub...
echo ========================================================
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  SUCCESS! Pushed to GitHub.
    echo  GitHub Actions is now building your APK.
    echo ========================================================
) else (
    echo ========================================================
    echo  Error during push.
    echo ========================================================
)
echo.
pause
