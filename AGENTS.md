# AGENTS.md

## Project: Excalidraw

Excalidraw is a monorepo (Yarn workspaces) with a Vite-based React app in `excalidraw-app/` and core packages in `packages/`.

## Dev Environment (Base44)

- **Compose file**: `docker-compose.base44.yml` — runs a Node 22 container with Vite dev server on port 3000.
- **No external secrets required** for basic whiteboard functionality. Collaboration (WebSocket), AI backend, and Firebase auth are optional and configured via env vars.
- Vite config was patched to disable `open: true` inside Docker (crashes without `xdg-open`) and to allow all hosts (`allowedHosts: true`).
- Node modules are stored in named Docker volumes to avoid host/container platform mismatches.

## Quirks

- The `vite-plugin-checker` reports "ERROR" even with 0 errors — this is normal formatting.
- The `.env.development` file sets `VITE_APP_PORT=3001` but the compose overrides it to `3000`.
- `yarn install` takes ~60s on first boot (cold cache).

## Verify

```bash
curl -sf http://localhost:3000/ | grep "Excalidraw"
```
