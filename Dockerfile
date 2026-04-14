# syntax=docker/dockerfile:1

FROM node:25-alpine@sha256:ad82ecad30371c43f4057aaa4800a8ed88f9446553a2d21323710c7b937177fc AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

COPY . .

RUN npm run build

RUN rm -rf node_modules && \
    npm ci --omit=dev --ignore-scripts

FROM node:25-alpine@sha256:ad82ecad30371c43f4057aaa4800a8ed88f9446553a2d21323710c7b937177fc

WORKDIR /app

RUN addgroup -S -g 10001 appgroup && \
    adduser -S -u 10001 -G appgroup appuser

ENV NODE_ENV=production

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
COPY --from=builder --chown=appuser:appgroup /app/drizzle ./drizzle
COPY --from=builder --chown=appuser:appgroup /app/assets ./assets

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO /dev/null http://localhost:3000/healthz || exit 1

ENTRYPOINT ["node", "dist/server/app.js"]
