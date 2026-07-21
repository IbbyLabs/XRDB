# Stage 1: build the Next.js static export
FROM node:22-alpine AS web-builder
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --ignore-scripts
COPY web ./
RUN npm run build
# Output lands in /src/internal/ui/dist (distDir in next.config.ts)

# Stage 2: build the Go binary (with embedded UI)
FROM golang:1.25-alpine AS go-builder
ARG XRDB_BUILD_VERSION
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
# Pull in the static export produced by the web builder
COPY --from=web-builder /src/internal/ui/dist ./internal/ui/dist
# Stamp the version into the binary rather than the image environment, so it
# travels with the build itself and can't be carried forward onto a newer image.
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags="-s -w -X xrdb_rewrite/internal/config.buildVersion=${XRDB_BUILD_VERSION}" \
    -o /out/xrdb-api ./cmd/api

# Stage 3: minimal runtime image
FROM alpine:3.21
RUN adduser -D -H -s /sbin/nologin appuser \
    && mkdir -p /data \
    && chown appuser:appuser /data
USER appuser
WORKDIR /app
COPY --from=go-builder /out/xrdb-api /app/xrdb-api
VOLUME ["/data"]
EXPOSE 8787
ENV XRDB_ADDR=:8787 \
    XRDB_DB=/data/xrdb.db \
    XRDB_CACHE_DIR=/data/cache
CMD ["/app/xrdb-api"]
