@echo off
title Eyetouch Video Editor - Durdur
set "FOUND=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
    set "FOUND=1"
)
if "%FOUND%"=="1" (
    echo Sunucu durduruldu.
) else (
    echo Calisan sunucu bulunamadi.
)
ping -n 3 127.0.0.1 >nul
