#!/bin/sh
# verify-station-vps.sh — run ON THE VPS after deploying a station.
#
#   sh scripts/verify-station-vps.sh HM314.88-EN
#
# Lives as a file rather than as an inline `ssh node -e '...'` because the
# quoting does not survive the PowerShell -> ssh -> sh journey: the escaped
# double quotes are eaten before bash ever sees them and node is handed a bare
# require(./path). A script has no quoting to lose.
set -e
STATION="${1:?usage: verify-station-vps.sh <STATION_ID>}"
cd "$(dirname "$0")/.."

echo "=== the cron chain loads ==="
# build-station-manifest.js requires data/yeshua-selection.json at MODULE LOAD.
# The VPS is not a full clone, so a tools file that grows a new top-level
# require breaks the nightly cron for every station until the dependency ships.
node -e 'require("./scripts/r2-publish-schedules.js"); console.log("  r2-publish-schedules  OK")'
node -e 'require("./tools/build-station-manifest.js"); console.log("  build-station-manifest OK")'
node -e 'require("./tools/build-schedule-manifest.js"); console.log("  build-schedule-manifest OK")'

echo "=== every ON AIR station has a current tenant record ==="
node tools/sync-tenants.js | tail -4

echo "=== $STATION has a pool (no pool here = no schedule tomorrow) ==="
ls -la "tmp/pools/$STATION.music.json"

echo "=== the VPS reproduces the schedule this station was published with ==="
# Same station + same date must give a byte-identical rev, or tomorrow's cron
# quietly replaces today's programming with something built from a stale pool.
node scripts/r2-publish-schedules.js --station "$STATION" --days 1 | tail -3

echo "=== service ==="
systemctl is-active kjubilee
