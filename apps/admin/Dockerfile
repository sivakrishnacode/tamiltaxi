# Tamil Taxi admin panel (Next.js standalone). Build from the repo root (npm workspaces):
#   docker build -f apps/admin/Dockerfile -t tamiltaxi-admin .
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/passenger/package.json apps/passenger/
COPY apps/driver/package.json apps/driver/
COPY packages/tamiltaxi_ui/package.json packages/tamiltaxi_ui/
COPY packages/tamiltaxi_data/package.json packages/tamiltaxi_data/
RUN npm ci --workspace=@tamiltaxi/admin --include-workspace-root=false --no-audit --no-fund

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
# Baked into the client bundle at build time: Google Maps JavaScript API browser key (restrict by HTTP referrer).
ARG NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
ENV NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
ARG NEXT_PUBLIC_GOOGLE_MAP_ID=
ENV NEXT_PUBLIC_GOOGLE_MAP_ID=${NEXT_PUBLIC_GOOGLE_MAP_ID}
ARG NEXT_PUBLIC_GOOGLE_MAP_ID_NO_PLACES=
ENV NEXT_PUBLIC_GOOGLE_MAP_ID_NO_PLACES=${NEXT_PUBLIC_GOOGLE_MAP_ID_NO_PLACES}
COPY apps/admin apps/admin
WORKDIR /repo/apps/admin
RUN npx next build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
RUN apk add --no-cache tini && addgroup -S tamiltaxi && adduser -S tamiltaxi -G tamiltaxi
# Standalone output keeps the monorepo layout: server.js lives in apps/admin/.
COPY --from=build --chown=tamiltaxi:tamiltaxi /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=tamiltaxi:tamiltaxi /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=tamiltaxi:tamiltaxi /repo/apps/admin/public ./apps/admin/public
USER tamiltaxi
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/login > /dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/admin/server.js"]
