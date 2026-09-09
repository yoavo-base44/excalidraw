# Base44 dev notes

- Excalidraw yarn workspaces monorepo; dev server = `yarn start` (vite) in `excalidraw-app`.
- Dev port comes from `VITE_APP_PORT` in `.env.development` (3001); compose maps host 3000 -> 3001.
- Env vars are loaded from the repo root (`envDir: "../"`); no secrets needed — collab/AI/Firebase point at public dev backends.
- Root `node_modules` lives in a named volume; `yarn install` runs on container start (first boot ~2-3 min).
- Vite `open: true` is neutralized with `BROWSER=none`.
- Verify: `curl -s localhost:3000 | head` should return the Excalidraw index HTML with `/@vite/client`.
