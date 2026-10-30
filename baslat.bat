@echo off
title Eyetouch Video Editor
cd /d "%~dp0"

rem ---- Sunucu zaten acik mi? (port 5173) ----
netstat -aon | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo Sunucu zaten calisiyor - tarayici aciliyor...
    start "" "http://localhost:5173/"
    ping -n 3 127.0.0.1 >nul
    exit /b 0
)

rem ---- Ilk calistirma: paketlerin kurulmasi ----
if not exist "node_modules" (
    echo Ilk kez baslatiliyor - paketler kuruluyor, birkac dakika surebilir...
    call npm install
    if errorlevel 1 (
        echo Kurulum basarisiz! Internet baglantinizi kontrol edin.
        ping -n 5 127.0.0.1 >nul
        exit /b 1
    )
)

rem ---- Sunucuyu kucuk pencerede baslat, tarayici otomatik acilir ----
echo Sunucu baslatiliyor - tarayiciniz otomatik acilacak...
start "Eyetouch Video Editor Sunucusu" /min cmd /c "npm start"
echo.
echo   Hazir: http://localhost:5173/
echo   Durdurmak icin: durdur.bat
ping -n 4 127.0.0.1 >nul
