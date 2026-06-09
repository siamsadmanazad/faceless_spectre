FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Install all deps (needed to build workspace packages) ─────────────────────
FROM base AS installer
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json      ./apps/server/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build shared + server ─────────────────────────────────────────────────────
FROM installer AS builder
COPY packages/shared ./packages/shared
COPY apps/server     ./apps/server
RUN pnpm --filter @faceless-spectre/shared build
RUN pnpm --filter @faceless-spectre/server build
# Bundle prod deps; workspace packages are inlined (no symlinks)
RUN pnpm --filter @faceless-spectre/server deploy --prod /deploy

# ── Lean runtime image ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# prod node_modules with inlined workspace deps
COPY --from=builder /deploy .
# dist/ is gitignored so pnpm deploy excludes it — copy explicitly
COPY --from=builder /app/apps/server/dist ./dist
EXPOSE 2567
CMD ["node", "dist/index.js"]
