FROM node:22-alpine AS builder
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN adduser -D -H -s /sbin/nologin appuser
USER appuser
WORKDIR /app
COPY --from=builder /web/.next/standalone ./
COPY --from=builder /web/.next/static ./.next/static
EXPOSE 3001
ENV PORT=3001 \
    HOSTNAME=0.0.0.0
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3001/ || exit 1
CMD ["node", "server.js"]
