@echo off
rem GitHub release paketini olusturur: EyetouchVideoEditor.zip
rem Icerik: dist/ + server.cjs + README + LICENSE + Eyetouch.exe (node_modules HARIC -
rem guncelleyici exe haricini kopyalar; server icin node gerekmez). GITHUBA ATMA: zip .gitignore'da.
cd /d "%~dp0"
if exist EyetouchVideoEditor.zip del EyetouchVideoEditor.zip
powershell -NoProfile -Command "Compress-Archive -Path dist, server.cjs, README.md, LICENSE, Eyetouch.exe -DestinationPath EyetouchVideoEditor.zip -Force"
if errorlevel 1 (
  echo PAKET HATASI
  pause
  exit /b 1
)
echo OK: EyetouchVideoEditor.zip hazir.
pause
