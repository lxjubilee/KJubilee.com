# deploy-station.ps1 — ship a new or changed station to production.
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-station.ps1 -Station HM303.10-EN
#
# The R2 half — the audio and the dated day files — is published from THIS
# workstation, because it is the only host that can see the J: music share:
#
#   node scripts/r2-sync-music.js --apply
#   node scripts/r2-publish-schedules.js --apply --station <ID> --days 7
#
# This script is the VPS half: the site catalogue that puts the card on the
# page, the tenant records that make channels resolvable, and the POOL, without
# which the nightly cron produces no schedule for the station at all.
#
# Static files under public/ need no restart — Express serves them from disk.
# The restart is for the tools and scripts the cron loads.

param(
    [Parameter(Mandatory = $true)][string]$Station,
    [string]$VpsHost = 'root@94.72.120.231',
    [string]$Root    = '/var/www/kjubilee.com'
)

$ErrorActionPreference = 'Stop'

$Key    = "$env:USERPROFILE\.ssh\id_ed25519_jubilee_prod"
$Repo   = Split-Path -Parent $PSScriptRoot
$Stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = "/var/www/_deploy-backups/kjubilee-$Stamp"

function Remote([string]$cmd) {
    & ssh -i $Key $VpsHost $cmd
    if ($LASTEXITCODE -ne 0) { throw "remote command failed: $cmd" }
}
function Push([string]$rel) {
    $local = Join-Path $Repo $rel
    if (-not (Test-Path $local)) { throw "missing locally: $rel" }
    $remote = "$Root/" + ($rel -replace '\\', '/')
    Write-Host "  -> $remote"
    & scp -i $Key $local "${VpsHost}:$remote"
    if ($LASTEXITCODE -ne 0) { throw "scp failed: $rel" }
}

# THE VPS IS NOT A FULL CLONE, and finding that out the hard way is what this
# list exists to prevent. It carries no `data/` and no `tools/music-ingest/` at
# all, so shipping a tools file that grew a new top-level require -- as
# build-station-manifest.js did when it started reading data/yeshua-selection.json
# -- breaks the nightly cron for EVERY station, not just the one being deployed.
# The directories are created before the copy for exactly that reason.
$Dirs = @('data', 'tools/music-ingest', 'tools/lib', 'tmp/pools')

$Files = @(
    # the card and the dial entry
    'public/radio.html',
    'public/js/stations-data.js',
    # the generator, publisher and player all resolve a channel through /tenants;
    # ship them ALL, not just the new one -- a newer STATIONS makes older tenant
    # records stale, and a stale record is what the publisher writes into day files
    'tenants',
    # what the cron loads. build-station-manifest requires data/yeshua-selection.json
    # at module load and reads tools/music-ingest/catalog-config.json inside
    # buildStation; both must be present or the chain dies on require.
    'data/yeshua-selection.json',
    'tools/music-ingest/catalog-config.json',
    'tools/build-station-manifest.js',
    'tools/build-schedule-manifest.js',
    'tools/build-home-data.js',
    'tools/sync-tenants.js',
    'tools/lib/tenants.js',
    'tools/lib/zone.js',
    'scripts/r2-publish-schedules.js'
)

Write-Host "deploying $Station to $VpsHost"
Write-Host "1/5  backing up to $Backup"
Remote "mkdir -p $Backup && cd $Root && tar cf - public/radio.html public/js/stations-data.js tenants tools scripts data 2>/dev/null | tar xf - -C $Backup 2>/dev/null; true"

Write-Host "2/5  making sure the directories exist"
Remote ("mkdir -p " + (($Dirs | ForEach-Object { "$Root/$_" }) -join ' '))

Write-Host "3/5  files"
foreach ($f in $Files) {
    if ($f -eq 'tenants') {
        Write-Host "  -> $Root/tenants/ (all records)"
        & scp -i $Key (Join-Path $Repo 'tenants\*.json') "${VpsHost}:$Root/tenants/"
        if ($LASTEXITCODE -ne 0) { throw 'scp failed: tenants' }
    } else { Push $f }
}

Write-Host "4/5  the station's pool"
# scripts/kjubilee-schedules.cron runs r2-publish-schedules.js WITHOUT
# --rebuild-pools, because the VPS cannot see the J: music share. A station with
# no pool here gets no schedule tomorrow, however good its day files are today.
Push "tmp/pools/$Station.music.json"

Write-Host "5/5  restart + verify"
Push 'scripts/verify-station-vps.sh'
Remote "systemctl restart kjubilee && sleep 2 && systemctl is-active kjubilee"
# The checks run from a FILE on the VPS, not from an inline `node -e '...'`.
# Escaped quotes do not survive PowerShell -> ssh -> sh: node ends up handed a
# bare require(./path) and dies on the dot. A script has no quoting to lose.
Remote "cd $Root && sh scripts/verify-station-vps.sh $Station"

Write-Host ''
Write-Host 'live checks:'
foreach ($u in @('https://kjubilee.com/', 'https://kjubilee.com/js/stations-data.js')) {
    try   { $code = (Invoke-WebRequest -Uri $u -UseBasicParsing -Method Head).StatusCode }
    catch { $code = $_.Exception.Response.StatusCode.value__ }
    Write-Host ("  {0,-45} {1}" -f $u, $code)
}
$cat = (Invoke-WebRequest -Uri 'https://kjubilee.com/js/stations-data.js' -UseBasicParsing).Content
$slug = (Get-Content (Join-Path $Repo "tenants\$Station.json") -Raw | ConvertFrom-Json).slug
Write-Host ("  '{0}' in live catalogue: {1}" -f $slug, $(if ($cat -match [regex]::Escape($slug)) { 'YES' } else { 'NO' }))
