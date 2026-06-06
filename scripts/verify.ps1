# Esports Isolator PRO quick verification script.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== Unit tests ==" -ForegroundColor Cyan
python -m unittest discover -s tests -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Dry-run ==" -ForegroundColor Cyan
python best_isolator.py --dry-run
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n== Full release gate ==" -ForegroundColor Cyan
Write-Host "Run: powershell -File scripts/release-check.ps1"

Write-Host "`n== Manual CS2 session (optional) ==" -ForegroundColor Cyan
Write-Host @"
  copy config.json.example config.json
  python best_isolator.py --log-file isolator-run.log
  Play CS2 15-20 min, then Ctrl+C

  Log checklist:
    Select-String isolator-run.log -Pattern 'Game closed|RESTORE|SHUTDOWN|Throttled 0 new'
"@
