SHELL := /bin/sh

.PHONY: run test bench build docker-build up down

run:
	go run ./cmd/api

test:
	go test ./...

bench:
	go test -run ^$ -bench . -benchmem ./internal/render

build:
	go build ./...

docker-build:
	docker build -t xrdb-rewrite-api:dev .

up:
	docker compose up --build

down:
	docker compose down --remove-orphans
