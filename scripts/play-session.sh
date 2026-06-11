#!/usr/bin/env bash
#
# play-session.sh
#
# One-command "play with friends, for free" launcher. Faceless Spectre's game
# server is a stateful WebSocket server that has no good *permanent* free host
# (free tiers sleep and drop connections, or expire their database). So the
# cheapest reliable option is to run the whole thing on THIS machine and expose
# it to friends through Cloudflare quick tunnels — random public HTTPS URLs that
# forward to your localhost. Friends just open a link; they install nothing.
#
# This script does the 4-terminal dance for you:
#   1. boots Postgres + Redis            (pnpm db:up)
#   2. starts the game server            (port 2567)
#   3. opens a tunnel to the server, reads its public URL, and writes it into
#      apps/client/.env.local as NEXT_PUBLIC_SERVER_URL
#   4. starts the client in dev mode     (port 3000)
#   5. opens a tunnel to the client and prints the link to share with friends
#
# Dev mode (not the production static export) is intentional: it serves live
# room ids as dynamic routes. CORS on the server is already `origin: true`, and
# apps/client/src/lib/serverUrl.ts honours a real NEXT_PUBLIC_SERVER_URL, so no
# code changes are needed — this is purely orchestration.
#
# Prerequisites (one-time):
#   - Docker Desktop running        (for Postgres + Redis)
#   - cloudflared installed         (brew install cloudflared)
#
# Run:     bash scripts/play-session.sh
# Stop:    Ctrl-C  (tears down tunnels, client, server, and restores .env.local)
#
# NOTE: quick-tunnel URLs are random every run. For stable URLs, set up a named
# Cloudflare tunnel + a domain (see plan/README). Your machine must stay on and
# this script must keep running for friends to reach the game.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$ROOT/apps/client/.env.local"
LOG_DIR="$(mktemp -d -t fs-play-XXXXXX)"
SERVER_TUNNEL_LOG="$LOG_DIR/server-tunnel.log"
CLIENT_TUNNEL_LOG="$LOG_DIR/client-tunnel.log"

PIDS=()
ENV_BACKUP=""

# ── Cleanup: kill everything we started, restore the env file ─────────────────
cleanup() {
  echo ""
  echo "[play-session] shutting down…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # give children a moment, then force
  sleep 1
  for pid in "${PIDS[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done

  # Restore apps/client/.env.local to its pre-run state.
  if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    mv "$ENV_BACKUP" "$ENV_LOCAL"
  elif [ "$ENV_BACKUP" = "__none__" ]; then
    rm -f "$ENV_LOCAL"
  fi

  rm -rf "$LOG_DIR" 2>/dev/null || true
  echo "[play-session] done. (Postgres/Redis left running — stop with: pnpm db:down)"
}
trap cleanup EXIT INT TERM

# ── Preflight ─────────────────────────────────────────────────────────────────
command -v cloudflared >/dev/null 2>&1 || {
  echo "[play-session] ERROR: cloudflared not found. Install it: brew install cloudflared"
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "[play-session] ERROR: Docker is not running. Start Docker Desktop and retry."
  exit 1
}

# Wait for a trycloudflare URL to appear in a tunnel's log (up to ~30s).
wait_for_tunnel_url() {
  local log="$1" label="$2" url=""
  for _ in $(seq 1 60); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1)"
    [ -n "$url" ] && { echo "$url"; return 0; }
    sleep 0.5
  done
  echo "[play-session] ERROR: timed out waiting for the $label tunnel URL. See $log" >&2
  return 1
}

# ── 1. Local infra ────────────────────────────────────────────────────────────
echo "[play-session] starting Postgres + Redis…"
(cd "$ROOT" && pnpm db:up)

# ── 2. Game server ────────────────────────────────────────────────────────────
echo "[play-session] starting game server on :2567…"
(cd "$ROOT" && pnpm --filter @faceless-spectre/server dev) &
PIDS+=($!)

# ── 3. Server tunnel → write NEXT_PUBLIC_SERVER_URL ───────────────────────────
echo "[play-session] opening server tunnel…"
cloudflared tunnel --url http://localhost:2567 >"$SERVER_TUNNEL_LOG" 2>&1 &
PIDS+=($!)
SERVER_URL="$(wait_for_tunnel_url "$SERVER_TUNNEL_LOG" "server")" || exit 1
echo "[play-session] server reachable at: $SERVER_URL"

# Back up the existing .env.local (or remember that there wasn't one) so cleanup
# can restore it, then point the client at the server tunnel.
if [ -f "$ENV_LOCAL" ]; then
  ENV_BACKUP="$LOG_DIR/.env.local.bak"
  cp "$ENV_LOCAL" "$ENV_BACKUP"
else
  ENV_BACKUP="__none__"
fi
printf 'NEXT_PUBLIC_SERVER_URL=%s\n' "$SERVER_URL" > "$ENV_LOCAL"

# ── 4. Client (dev mode) ──────────────────────────────────────────────────────
echo "[play-session] starting client on :3000…"
(cd "$ROOT" && pnpm --filter @faceless-spectre/client dev) &
PIDS+=($!)

# ── 5. Client tunnel → the link to share ──────────────────────────────────────
echo "[play-session] opening client tunnel…"
cloudflared tunnel --url http://localhost:3000 >"$CLIENT_TUNNEL_LOG" 2>&1 &
PIDS+=($!)
CLIENT_URL="$(wait_for_tunnel_url "$CLIENT_TUNNEL_LOG" "client")" || exit 1

echo ""
echo "  ┌──────────────────────────────────────────────────────────────┐"
echo "  │  Faceless Spectre is live. Share this link with your friends:  │"
echo "  └──────────────────────────────────────────────────────────────┘"
echo ""
echo "      $CLIENT_URL"
echo ""
echo "  (May take ~10s to become reachable. Keep this terminal open;"
echo "   Ctrl-C ends the session and tears everything down.)"
echo ""

# Keep running until interrupted; if any background job dies, fall through to cleanup.
wait
