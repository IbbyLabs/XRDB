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
CMD ["node", "server.js"]
