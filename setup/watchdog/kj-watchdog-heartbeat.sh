#!/bin/sh
# kj-watchdog-heartbeat.sh — the other half of the checks and balances.
#
# The watchdog watches the stations. THIS watches the watchdog: if its heartbeat
# has gone stale, the thing that repairs outages has itself stopped, and nothing
# else on this box would notice. It restarts the timer and shouts in the log.
#
# Deliberately a plain shell script with no dependencies — not node, not the
# repo. If the checkout, node, or the app were the problem, a checker written on
# top of them would fail in the same breath as the thing it is checking.
set -u

HEARTBEAT=/var/lib/kj-watchdog/heartbeat.json
LOG=/var/log/kj-watchdog.log
# The watchdog runs every 15 minutes; three missed runs is unambiguous.
MAX_AGE=2700

stamp() { date -u +'%Y-%m-%d %H:%M:%S'; }
say()   { echo "$(stamp)  [heartbeat] $*" >> "$LOG"; }

if [ ! -f "$HEARTBEAT" ]; then
    say "ALARM no heartbeat file at $HEARTBEAT — the watchdog has never completed a run"
    systemctl start kj-watchdog.service
    exit 1
fi

age=$(( $(date +%s) - $(stat -c %Y "$HEARTBEAT") ))
if [ "$age" -gt "$MAX_AGE" ]; then
    say "ALARM heartbeat is ${age}s old (limit ${MAX_AGE}s) — restarting the watchdog timer"
    systemctl restart kj-watchdog.timer
    systemctl start kj-watchdog.service
    exit 1
fi

# Fresh, but did the last run actually succeed? A watchdog that runs on time and
# reports ok:false every time is not healthy either.
if grep -q '"ok": false' "$HEARTBEAT" 2>/dev/null; then
    say "ALARM last watchdog run finished with ok:false — a station is missing schedule it could not repair"
    exit 2
fi

exit 0
