# Base44 notes

- Run with `docker compose -f docker-compose.base44.yml up -d` (node:22 + `yarn start`, Vite dev server).
- The dev server port comes from `VITE_APP_PORT` in `.env.development` (3001); compose maps host 3000 -> 3001.
- `excalidraw-app/vite.config.mts` sets `host: true`, `allowedHosts: true`, `open: false` so the sandbox preview can reach it.
- First boot installs the yarn workspace deps into a named volume (`node_modules`); it takes a couple of minutes.
- No backend/database is needed; storage/collab use remote Excalidraw dev services configured in `.env.development`. No credentials required for the editor to work.
