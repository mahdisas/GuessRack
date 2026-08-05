# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build
FROM node:24-slim AS build
WORKDIR /app

# The public URL is baked in at build time: it lands in the canonical link, the
# Open Graph tags, the JSON-LD, robots.txt, sitemap.xml and llms.txt. Override
# it with the SITE_URL build arg in fly.toml.
ARG SITE_URL=https://guessrack.fly.dev
ENV VITE_SITE_URL=$SITE_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# -------------------------------------------------------------- runtime
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only `ws` is needed to run: three and vite are build-time only, and the
# client is already bundled into dist.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 8080
CMD ["node", "server/index.js"]
