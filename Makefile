SHELL := /bin/sh

.PHONY: all clean dev run test bench build build-web build-all docker-build up down

all: build-all

clean:
	rm -rf internal/ui/dist web/.next web/out

# Local dev stack: API on :8787 + web on :3001, keys from .env. Ctrl-C stops both.
dev:
	./scripts/dev.sh

run:
	go run ./cmd/api

test:
	go test ./...

bench:
	go test -run ^$ -bench . -benchmem ./internal/render

# Build Next.js static export into internal/ui/dist (required before go build)
build-web:
	cd web && npm ci --ignore-scripts && npm run build

# Full build: web first so the embed is up to date
build-all: build-web
	go build ./...

build:
	go build ./...

docker-build:
	docker build -t xrdb-rewrite-api:dev .

up:
	docker compose up --build

down:
	docker compose down --remove-orphans
