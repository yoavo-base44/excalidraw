# Base44 dev notes

- Run: `docker compose -f docker-compose.base44.yml up -d` (node:22 container, `yarn install` + `yarn start`).
- Vite dev server listens on 3001 inside the container (`VITE_APP_PORT` in `.env.development`), published on host port 3000.
- `excalidraw-app/vite.config.mts` sets `server.host: true` / `allowedHosts: true` and only auto-opens a browser when not in Docker/CI (`DOCKER_DEV`).
- No external credentials needed; default `.env.development` points at Excalidraw's public dev backends. Collab (`VITE_APP_WS_SERVER_URL`) and AI backend are not run locally.
- First boot installs the monorepo deps into the bind mount (a few minutes).
- Verify: `curl -sI localhost:3000` → 200 and the canvas loads in the preview.
