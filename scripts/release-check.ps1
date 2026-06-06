# Esports Isolator PRO release readiness gate.
param(
  [switch]$SkipPackage
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$UiPackage = Get-Content -LiteralPath "ui/package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$ReleaseVersion = $UiPackage.version
$InstallerArtifact = "Esports Isolator PRO Setup $ReleaseVersion.exe"
$PortableArtifact = "Esports-Isolator-PRO-$ReleaseVersion-portable.exe"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Assert-Exists {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Required release artifact or file is missing: $Path"
  }
}

function Assert-TextClean {
  param([Parameter(Mandatory = $true)][string]$Path)
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $markers = @(
    [string][char]0x00D0,
    [string][char]0x00D1,
    "$([char]0x00E2)$([char]0x20AC)$([char]0x201D)",
    "$([char]0x00E2)$([char]0x20AC)$([char]0x201C)"
  )
  foreach ($marker in $markers) {
    if ($text.Contains($marker)) {
      throw "Mojibake marker '$marker' found in $Path"
    }
  }
}

Invoke-Step "Python unit tests" {
  python -m unittest discover -s tests -p "test_*.py" -v
}

Invoke-Step "Config dry-run" {
  python best_isolator.py --dry-run
}

Invoke-Step "NPM dependency audit" {
  npm --prefix ui audit
}

Invoke-Step "Renderer build" {
  npm --prefix ui run build:renderer
}

Invoke-Step "Deterministic asset generation" {
  npm --prefix ui run build:assets
}

Invoke-Step "UI smoke test" {
  npm --prefix ui run smoke
}

if (-not $SkipPackage) {
  $packageOutput = Join-Path $Root "ui/dist-packaged"
  if (Test-Path -LiteralPath $packageOutput) {
    Remove-Item -LiteralPath $packageOutput -Recurse -Force
  }

  Invoke-Step "Windows package build" {
    npm --prefix ui run build
  }

  Assert-Exists "ui/dist-packaged/$InstallerArtifact"
  Assert-Exists "ui/dist-packaged/$PortableArtifact"

  Invoke-Step "Release checksum manifest" {
    powershell -File scripts/release-manifest.ps1
  }

  Assert-Exists "ui/dist-packaged/SHA256SUMS.txt"
}

Write-Host "`n== Public surface checks ==" -ForegroundColor Cyan
$requiredFiles = @(
  "README.md",
  "BUILDING.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/oss-launch-checklist.md",
  "docs/release-readiness.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/benchmark_report.md",
  ".github/pull_request_template.md",
  "docs/screenshots/dashboard.png",
  "docs/screenshots/topology.png",
  "docs/screenshots/settings.png"
)

foreach ($file in $requiredFiles) {
  Assert-Exists $file
}

foreach ($file in @("README.md", "BUILDING.md", "CONTRIBUTING.md", "SECURITY.md", "docs/oss-launch-checklist.md", "docs/release-readiness.md", "ui/src/i18n.jsx")) {
  Assert-TextClean $file
}

Write-Host "`n== Git ignore safety checks ==" -ForegroundColor Cyan
git check-ignore config.json *.log jail_state.json jail_state.json.tmp recovery_state.json recovery_state.json.tmp ui/dist-packaged
if ($LASTEXITCODE -ne 0) {
  throw "Expected local config/log/recovery/package artifacts to be ignored"
}

Write-Host "`nRelease readiness gate passed." -ForegroundColor Green
