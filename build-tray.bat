@echo off
rem Eyetouch.exe'yi derler (yerleşik .NET csc ile — kurulum gerektirmez).
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" /nologo /target:winexe /out:Eyetouch.exe /optimize+ ^
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll ^
  tools\EyetouchTray.cs
if errorlevel 1 (
  echo DERLEME HATASI
  pause
  exit /b 1
)
echo OK: Eyetouch.exe olusturuldu.
pause
