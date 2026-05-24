# =============================================================
# Zyphron Backend — Multi-stage Dockerfile
# Builds both API (default) and Worker (TARGET=worker)
# =============================================================
ARG NODE_VERSION=20
ARG TARGET=api

# ─── Stage 1: deps ───────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production && cp -r node_modules /app/node_modules_prod
RUN npm ci

# ─── Stage 2: build ──────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Stage 3: API runner ─────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS api
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache dumb-init docker-cli

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules_prod ./node_modules
COPY prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/projects

USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# ─── Stage 4: Worker runner ──────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache dumb-init docker-cli

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules_prod ./node_modules
COPY prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/projects

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/worker.js"]
