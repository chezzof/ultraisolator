# Generate SHA256 checksums for distributable release artifacts.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Dist = Join-Path $Root "ui/dist-packaged"
$UiPackage = Get-Content -LiteralPath "ui/package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$ReleaseVersion = $UiPackage.version
$Artifacts = @(
  "Esports Isolator PRO Setup $ReleaseVersion.exe"
)

if (-not (Test-Path -LiteralPath $Dist)) {
  throw "Package output directory is missing: $Dist"
}

$Lines = @()
foreach ($artifact in $Artifacts) {
  $path = Join-Path $Dist $artifact
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Release artifact is missing: $path"
  }
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $path
  $Lines += "$($hash.Hash.ToLowerInvariant())  $artifact"
}

$manifest = Join-Path $Dist "SHA256SUMS.txt"
[System.IO.File]::WriteAllLines($manifest, $Lines, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $manifest"
