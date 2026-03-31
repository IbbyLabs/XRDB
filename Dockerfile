FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

FROM base AS install
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY --from=install /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/public
RUN pnpm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

LABEL org.opencontainers.image.title="IbbyLabs Media Service"
LABEL org.opencontainers.image.description="Dynamic media artwork service with rating overlays and proxy tooling."
LABEL org.opencontainers.image.source="https://github.com/IbbyLabs/xrdb"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

RUN mkdir -p /app/data \
  && chown -R node:node /app

USER node

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
