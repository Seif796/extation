@echo off
chcp 65001 >nul
echo ========================================================
echo  🚀 جاري رفع Da7e Bot و ملف الـ APK إلى GitHub Actions...
echo ========================================================
echo.
set "PATH=C:\Program Files\Git\cmd;%PATH%"
cd /d "C:\Users\janah\OneDrive\Desktop\extintion"
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  ✅ تم الرفع بنجاح!
    echo  الآن يتم بناء ملف الـ APK تلقائياً على GitHub Actions.
    echo ========================================================
) else (
    echo.
    echo  ⚠️ حدث خطأ في الصلاحيات. يرجى التأكد من تسجيل الدخول بحساب Seif796.
)
echo.
pause
