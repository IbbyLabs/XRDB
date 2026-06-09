FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/xrdb-api ./cmd/api

FROM alpine:3.21
RUN adduser -D -H -s /sbin/nologin appuser
USER appuser
WORKDIR /app
COPY --from=builder /out/xrdb-api /app/xrdb-api
VOLUME ["/data"]
EXPOSE 8787
ENV XRDB_ADDR=:8787 \
    XRDB_DB=/data/xrdb.db \
    XRDB_CACHE_DIR=/data/cache
CMD ["/app/xrdb-api"]
