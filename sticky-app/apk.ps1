# Sticky-App: Tests, APK bauen, per adb aufs angesteckte Fold6 installieren und starten.
#   .\apk.ps1                  bauen, installieren, starten
#   .\apk.ps1 -OhneInstallieren nur bauen
# Vorlage: bubble-log-app\apk.ps1. Build-Ausgaben liegen außerhalb von OneDrive (%LOCALAPPDATA%\sticky-app-build).
param([switch]$OhneInstallieren)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Schritt($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Abbruch($t) { Write-Host "`nABBRUCH: $t" -ForegroundColor Red; exit 1 }

$jetzt = Get-Date
$version = $jetzt.ToString('yyyy.MM.dd-HHmm')
$code = [int](($jetzt - [datetime]'2026-01-01').TotalMinutes)
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot'
$env:STICKY_VERSION = $version
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$apk = Join-Path $env:LOCALAPPDATA 'sticky-app-build\app\outputs\apk\debug\app-debug.apk'
$paket = 'app.sticky.zwilling'

Schritt "Tests"
npm test --silent
if ($LASTEXITCODE) { Abbruch 'Tests schlagen fehl.' }

Schritt "Web-App bauen ($version)"
npm run build --silent
if ($LASTEXITCODE) { Abbruch 'Vite-Build fehlgeschlagen.' }

Schritt "Capacitor sync"
# OneDrive macht diesen Ordner sonst zu Reparse-Points („not a regular file“), deshalb frisch anlegen
if (Test-Path android\app\src\main\assets\public) { Remove-Item -Recurse -Force android\app\src\main\assets\public }
npx cap sync android
if ($LASTEXITCODE) { Abbruch 'cap sync fehlgeschlagen.' }

Schritt "Gradle"
Push-Location android
.\gradlew.bat assembleDebug --console=plain -q "-PstVersionCode=$code" "-PstVersionName=$version"
$gradle = $LASTEXITCODE
Pop-Location
if ($gradle) { Abbruch 'Gradle-Build fehlgeschlagen.' }
if (-not (Test-Path $apk) -or (Get-Item $apk).LastWriteTime -lt $jetzt) { Abbruch 'Keine frische app-debug.apk gefunden.' }
Write-Host ("OK: {0:N1} MB, Version {1}" -f ((Get-Item $apk).Length / 1MB), $version) -ForegroundColor Green

if ($OhneInstallieren) { exit 0 }

Schritt "Installieren"
& $adb install -r $apk
if ($LASTEXITCODE) { Abbruch 'adb install fehlgeschlagen (Handy angesteckt und USB-Debugging an?).' }
# adb install beendet die App und startet sie nicht von selbst
& $adb shell monkey -p $paket -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Fertig: Sticky $version installiert und gestartet." -ForegroundColor Green
