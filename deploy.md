# Deploying Faceless Spectre

This is the canonical deployment guide. It targets a **persistent, near-free,
friends-only** setup: a stable public URL friends can visit anytime, with cost
that idles to ~zero. Voice is out of scope (use Discord); the in-app text chat
covers the table back-channel.

> **Status:** deployment is deferred until game-logic polish is done. Everything
> below is wired and ready — `fly.toml`, the server `Dockerfile`, the static
> client export, and the GitHub Actions pipeline all exist. Going live is mostly
> creating accounts and setting secrets.

---

## 1. Architecture — what runs where

| Piece | Host | Why | Cost |
|---|---|---|---|
| **Client** (Next.js 3D table) | **Cloudflare Pages** | Static export — just files on a CDN. Persistent `*.pages.dev` URL. | Free |
| **Game server** (Colyseus + Fastify) | **Fly.io** (Docker, scale-to-zero) | Stateful, long-lived WebSocket server holding live room state. **Cannot** be serverless/edge. | ~free idle, pennies active |
| **Redis** (presence, room registry, rate-limit) | **Upstash** | Managed, generous free tier. | Free |
| **Postgres** (audit log only) | **Neon** | Managed, free tier. Not latency-critical. | Free |

```
Friend's browser ──HTTPS──▶ Cloudflare Pages (static client)
        │
        └──WSS──▶ Fly.io (Colyseus server) ──▶ Upstash Redis
                                            └──▶ Neon Postgres
```

**Non-negotiable (from `CLAUDE.md`):** the game server is a stateful,
long-lived WebSocket process. **Never** deploy it to Vercel/Netlify/Cloudflare
Workers or any serverless/edge runtime — those drop WebSocket connections and
can't hold room state. Vercel/Netlify/Pages are only for the *static client*.

### Why these specific choices
- **Cloudflare Pages over Vercel:** the client's static export is already built
  for Pages' `/room/*` rewrite (the `__room__` placeholder in
  `apps/client/src/app/room/[roomId]/page.tsx` + runtime path read in
  `RoomClient.tsx`). Vercel would need extra rewrite config for the same result.
- **Fly scale-to-zero:** there is no good *permanent* free tier for a stateful
  WS server. Letting it sleep when idle is the cheapest reliable option.
- **Upstash + Neon:** external free tiers keep the data layer at $0 without
  Fly's paid managed add-ons.

---

## 2. Prerequisites

- Accounts (all free to start): **Fly.io**, **Cloudflare**, **Upstash**, **Neon**, **GitHub**.
- Local CLIs: [`flyctl`](https://fly.io/docs/flyctl/install/) (`brew install flyctl`),
  and optionally [`wrangler`](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
  for manual client deploys.
- Node 20+, pnpm 10 (already used by the repo).

---

## 3. One-time setup

Run login commands interactively. In a Claude Code session, prefix them with `!`
(e.g. `! fly auth login`) so the output lands in the conversation.

### 3a. Data stores (Upstash Redis + Neon Postgres)
1. **Upstash** → create a Redis database → copy the **`rediss://…` connection URL**
   (use the TLS one).
2. **Neon** → create a project/database → copy the **`postgresql://…` connection
   string** (the pooled connection is fine).

The server auto-creates its `room_audits` table on boot (see
`apps/server/src/index.ts`), so no manual schema step is needed.

### 3b. Fly.io server
```bash
fly auth login
fly apps create faceless-spectre            # must match `app` in fly.toml
fly secrets set \
  DATABASE_URL='postgresql://…neon…' \
  REDIS_URL='rediss://…upstash…' \
  --app faceless-spectre
```
`PORT` and `NODE_ENV` are already set in `fly.toml` `[env]`, so they don't need
to be secrets. The first real deploy happens via CI (next section) — you don't
need to `fly deploy` by hand.

### 3c. Cloudflare Pages project
Create a Pages project named **`faceless-spectre`** (Cloudflare dashboard →
Workers & Pages → Create → Pages). It can start empty; CI pushes builds to it via
Wrangler (`pages deploy apps/client/out --project-name=faceless-spectre`). The
public URL will be `https://faceless-spectre.pages.dev`.

### 3d. GitHub Actions secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value / how to get it |
|---|---|
| `FLY_API_TOKEN` | `fly tokens create deploy` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens (Pages: Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar |
| `NEXT_PUBLIC_SERVER_URL` | `https://faceless-spectre.fly.dev` |

`NEXT_PUBLIC_SERVER_URL` is **baked into the client at build time** — it's the
origin the browser connects to. It must be the Fly app's HTTPS URL; the client
derives `wss://` from it automatically.

---

## 4. The CI/CD pipeline

`.github/workflows/deploy.yml` runs on every push to `main`:

1. **test** — `pnpm install`, build `shared`, lint server + client, type-build
   the server (catches schema-serialization regressions), run server + client
   test suites. **A failure here blocks both deploys.**
2. **deploy-server** *(needs test)* — `flyctl deploy --remote-only` builds the
   Docker image (`apps/server/Dockerfile`) and ships it to Fly.
3. **deploy-client** *(needs test)* — builds the Next.js static export with
   `NEXT_PUBLIC_SERVER_URL`, then `wrangler pages deploy apps/client/out`.

So once secrets are set, **deploying = pushing to `main`**. To redeploy without
code changes, re-run the latest workflow from the Actions tab.

> Until the secrets exist, the `test` job passes but `deploy-server` /
> `deploy-client` fail — that's expected and harmless.

---

## 5. Environment variables

See `.env.example` for the full template. Summary:

| Var | Local dev | Production |
|---|---|---|
| `DATABASE_URL` | docker-compose Postgres (`postgresql://phantom:phantom@localhost:5433/faceless_spectre`) | Neon URL → Fly secret |
| `REDIS_URL` | docker-compose Redis (`redis://localhost:6379`) | Upstash URL → Fly secret |
| `PORT` | `2567` | set in `fly.toml` |
| `NODE_ENV` | `development` | `production` (in `fly.toml`) |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:2567` | `https://faceless-spectre.fly.dev` → GitHub Actions secret |

---

## 6. Cost & the scale-to-zero trade-off

`fly.toml` is set to **sleep when idle**:

```toml
auto_stop_machines   = "stop"
auto_start_machines  = true
min_machines_running = 0
```

- **Idle:** the machine stops after the last connection drops → ~$0.
- **First join after idle:** Fly auto-starts it, ~1–3s cold start, then normal.
- **In-memory rooms don't survive an idle stop.** That's fine for a sandbox with
  no durable game state — friends just create a fresh table. (The Redis room
  registry entries expire on their own.)

**Want instant joins / always-warm instead?** Flip to:
```toml
auto_stop_machines   = false
min_machines_running = 1
```
That keeps one `shared-cpu-1x` / 512 MB machine running ~24/7 (roughly a few
dollars/month). Client, Redis, and Postgres stay free either way.

---

## 7. Smoke test after deploying

1. CI green on `main` (all three jobs).
2. `curl https://faceless-spectre.fly.dev/health` → `{"status":"ok",…}` (this
   also wakes the machine if it was asleep).
3. Open `https://faceless-spectre.pages.dev` on a device **off your Wi-Fi**
   (phone on cellular) → lobby loads, pick a name → **Quick Play** or **Create
   Private Table**.
4. From a second device, open the invite link / enter the code → both land at
   the same table and see each other's moves.
5. **Chat:** send a quick phrase, free text, and an emoji from each side → both
   see them with correct sender names.
6. **Visibility invariant:** a card you hold shows its face only to you and a
   back to the other viewer — confirms real filtered server state.

---

## 8. Caveats & gotchas

- **Cold start (~1–3s)** on the first join after idle — expected with
  scale-to-zero.
- **Free-tier database suspension:** Neon free databases can auto-suspend when
  idle and wake on next query (a small delay); only the audit log uses Postgres,
  so gameplay isn't affected. Upstash free has a daily command cap that's far
  above friends-only traffic.
- **Mixed content:** the client is HTTPS, so `NEXT_PUBLIC_SERVER_URL` must be
  HTTPS (Fly provides it). HTTP would be blocked by the browser.
- **CORS:** the server uses `cors({ origin: true })` (reflects any origin), so the
  Pages origin is accepted with no extra config.
- **Room cap:** rooms are capped at 6 players (mesh-voice ceiling from
  `CLAUDE.md`), though voice itself is unused here.
- **Custom domain (optional):** add one to the Cloudflare Pages project for a
  nicer URL; point `NEXT_PUBLIC_SERVER_URL` at a Fly custom domain if you also
  want a branded server host.

---

## 9. Local play without deploying (optional)

For an ad-hoc session before the real deploy, `scripts/play-session.sh` runs the
whole stack on your machine and exposes it via Cloudflare quick tunnels (friends
just open a link). Needs Docker Desktop + `cloudflared` (`brew install cloudflared`).

```bash
bash scripts/play-session.sh
```

It boots Postgres/Redis, the server, and the client, opens a tunnel for each, and
prints the shareable link. Ctrl-C tears it all down. Trade-off: your machine must
stay on, and the tunnel URLs are random each run. This is a convenience for
testing — the Cloudflare Pages + Fly setup above is the real, persistent path.

---

## 10. Quick reference

```bash
# One-time
fly auth login
fly apps create faceless-spectre
fly secrets set DATABASE_URL='…' REDIS_URL='…' --app faceless-spectre
fly tokens create deploy            # → FLY_API_TOKEN (GitHub secret)

# Deploy (after secrets are set)
git push origin main                # CI deploys server + client

# Manual server deploy (bypass CI)
fly deploy --remote-only

# Manual client deploy (bypass CI)
NODE_ENV=production NEXT_PUBLIC_SERVER_URL=https://faceless-spectre.fly.dev \
  pnpm --filter @faceless-spectre/client build
wrangler pages deploy apps/client/out --project-name=faceless-spectre

# Health / logs
curl https://faceless-spectre.fly.dev/health
fly logs --app faceless-spectre
```
