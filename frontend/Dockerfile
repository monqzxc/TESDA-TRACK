# The React app: Node builds dist/, then Caddy serves it on port 8080 (see Caddyfile). The site's own Caddy
# (deploy/Caddyfile) sits in front, with HTTPS, and serves it at BASE_PATH.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Where the site serves the app: /beta/ while it runs beside Streamlit, / after the switch.
ARG BASE_PATH=/
RUN npm run build -- --base "$BASE_PATH"

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
