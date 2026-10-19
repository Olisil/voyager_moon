@echo off
rem Makes the Moon height data for Voyager Moon. Double-click this file.
cd /d "%~dp0.."
echo Installing the Python packages the script needs...
py -m pip install --upgrade rasterio numpy pillow
if errorlevel 1 (
  echo.
  echo Could not run Python. Install Python 3.11 or newer from python.org and tick "Add python.exe to PATH", then try again.
  pause
  exit /b 1
)
py tools\make_moon_tiles.py %*
echo.
echo Done. Upload the src\moon-data folder to GitHub.
pause
