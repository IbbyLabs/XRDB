SHELL := /bin/sh

.PHONY: run test bench build build-web build-all docker-build up down

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
