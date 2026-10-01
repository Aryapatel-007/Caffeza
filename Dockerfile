# One container for the whole app: the API and the built screens on one
# address. P12. Host-neutral: any host that runs a container works.
#
# No secret is ever in the image. Every environment variable, from MONGO_URI to
# the JWT secrets, comes from the host when the container runs.
#
# Indexes are a release step, not a start step: run `npm run db:indexes`
# against the database before moving traffic to a new version. The server
# refuses to start in production while a declared index is missing.

# ---- Build: install everything and build the client ----
FROM node:20-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .
RUN npm run build

# ---- Run: production dependencies, the server, and the built client ----
FROM node:20-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspace=server --include-workspace-root \
  && npm cache clean --force

COPY --chown=node:node server ./server
COPY --chown=node:node setup ./setup
COPY --chown=node:node --from=build /app/client/dist ./client/dist

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
