# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependency installation
# Aikido Safe Chain intercepts bun at install time and checks every package
# for malware before it is written to disk.
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Aikido Safe Chain with CI shims so it wraps bun automatically
RUN curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.12/install-safe-chain.sh \
    | sh -s -- --ci

# Install dependencies — every package is scanned before installation
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — build
# Compiles the Next.js application with the installed node_modules.
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for public env vars baked into the static bundle
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_BASE_URL_ACCOUNTS

ENV NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL}
ENV NEXT_PUBLIC_BASE_URL_ACCOUNTS=${NEXT_PUBLIC_BASE_URL_ACCOUNTS}
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runtime image
# Contains only the compiled Next.js output and the minimal runtime; no
# source code, node_modules, or build tooling.
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Next.js standalone output bundles its own node_modules subset
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["bun", "server.js"]
