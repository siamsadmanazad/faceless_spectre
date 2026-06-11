/**
 * Resolve the game-server origin for the browser to talk to.
 *
 * The subtlety: `NEXT_PUBLIC_SERVER_URL` is baked at build time and defaults to
 * `localhost:2567` for local dev. That's correct when the page is *also* opened
 * on the dev machine — but the moment a second device (a phone, another laptop)
 * opens the client over the LAN (e.g. `http://192.168.1.20:3000`), "localhost"
 * on that device points at the device itself, which runs no server, so every
 * fetch/WebSocket silently fails — including "join by code".
 *
 * So: when we're being viewed from a non-localhost host and the configured URL
 * still points at localhost, derive the server origin from the current host
 * (same hostname, server port). A genuinely remote/production URL is respected.
 */
const DEFAULT_PORT = 2567;
const ENV_URL = process.env.NEXT_PUBLIC_SERVER_URL;

function isLocal(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function getServerUrl(): string {
  const fallback = ENV_URL ?? `http://localhost:${DEFAULT_PORT}`;

  // SSR / no window — nothing to derive from; use the configured value.
  if (typeof window === 'undefined') return fallback;

  const pageHost = window.location.hostname;

  // Viewed from the dev machine itself → the configured URL is correct.
  if (isLocal(pageHost)) return fallback;

  // Viewed from another device. If the env points somewhere real (production),
  // honour it; otherwise it points at localhost — rewrite it to this host so the
  // other device reaches the same server that served the page.
  if (ENV_URL && !/localhost|127\.0\.0\.1|\[::1\]/.test(ENV_URL)) return ENV_URL;

  const proto = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${proto}//${pageHost}:${DEFAULT_PORT}`;
}
