#!/usr/bin/env bash
#
# reap-stale-chrome.sh
#
# Kills *leaked headless* Chrome instances that browser-automation/verify runs
# can leave behind. Headless Chrome with no display falls back to SwiftShader
# (software WebGL), which silently pegs the CPU at 1000%+ rendering the 3D table.
#
# SAFETY: this NEVER touches your normal GUI Chrome. It only matches processes
# launched with `--headless` AND an automation marker (a CDP debugging port, the
# throwaway /tmp/fs-chrome-profile, or forced software GL). Your interactive
# browser is never started with --headless, so it can't match.
#
# Run manually any time:   bash scripts/reap-stale-chrome.sh
# Runs automatically before `pnpm dev` (see root package.json "predev").

set -uo pipefail

# pid list of Chrome processes that look like leaked automation instances
pids=$(ps -Ao pid,command 2>/dev/null \
  | awk '/Google Chrome/ && /--headless/ \
         && (/remote-debugging-port/ || /fs-chrome-profile/ || /swiftshader/) \
         { print $1 }')

if [ -z "${pids//[[:space:]]/}" ]; then
  echo "[reap-stale-chrome] no leaked headless Chrome found"
else
  echo "[reap-stale-chrome] reaping leaked headless Chrome: $(echo "$pids" | tr '\n' ' ')"
  # graceful first, then force
  echo "$pids" | xargs -r kill 2>/dev/null || true
  sleep 1
  echo "$pids" | xargs -r kill -9 2>/dev/null || true
fi

# Remove the throwaway automation profile if it was left on disk.
rm -rf /tmp/fs-chrome-profile 2>/dev/null || true

# Never block the thing that runs us (e.g. `pnpm dev`).
exit 0
