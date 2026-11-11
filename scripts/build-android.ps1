param(
  [switch]$UseGoogleCdn,
  [ValidateSet('debug', 'release')][string]$Variant = 'debug',
  [ValidateSet('arm64-v8a', 'x86_64', 'all')][string]$Architecture = 'arm64-v8a'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'platform-tools\adb.exe'))) {
  throw 'Set ANDROID_HOME to an installed Android SDK before building.'
}
$env:ANDROID_HOME = $sdkRoot
Push-Location $projectRoot
try {
  & python scripts/prepare_vision.py
  if ($LASTEXITCODE -ne 0) { throw 'Public vision model preparation failed.' }
  if (-not (Test-Path -LiteralPath android/gradlew.bat)) {
    & npx expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo Android prebuild failed.' }
  }
  $task = if ($Variant -eq 'release') { ':app:assembleRelease' } else { ':app:assembleDebug' }
  $arguments = @($task, '--console=plain', '--max-workers=2', '-Pandroid.cmakeVersion=3.31.6')
  if ($Architecture -ne 'all') { $arguments += "-PreactNativeArchitectures=$Architecture" }
  if ($UseGoogleCdn) { $arguments += @('-I', (Join-Path $PSScriptRoot 'android-google-cdn.init.gradle')) }
  Push-Location android
  try {
    # Windows PowerShell 5 treats stderr warnings as ErrorRecords. Gradle's
    # exit code, not the existence of warning output, determines build failure.
    try {
      $ErrorActionPreference = 'Continue'
      & .\gradlew.bat @arguments
      $gradleExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($gradleExit -ne 0) { throw 'Android native build failed. See the Gradle error above.' }
  } finally { Pop-Location }
  Get-ChildItem -LiteralPath "android/app/build/outputs/apk/$Variant" -Filter '*.apk' | Select-Object FullName, Length
} finally { Pop-Location }
