# AGENTS.md

## Project: Excalidraw

Excalidraw is a collaborative whiteboard app built as a Vite + React monorepo with yarn workspaces.

## Setup Notes

- **Monorepo structure**: Root `package.json` uses yarn workspaces linking `excalidraw-app/`, `packages/*`, and `examples/*`.
- **Dev server**: The Vite dev server runs from `excalidraw-app/` with `envDir: "../"` so it reads `.env.development` from root.
- **Port**: Default dev port from `.env.development` is 3001 but we override to 3000 for the preview.
- **open: true in vite.config.mts**: The vite config has `server.open: true` which must be overridden with `--open false` in Docker (no browser available).
- **No external secrets required**: The app runs client-side only. Firebase config and backend URLs are public/dev defaults in `.env.development`.
- **TypeScript checker**: Runs alongside vite via `vite-plugin-checker`. ESLint is disabled in dev for speed.
- **Node version**: Requires Node >= 18. Using node:22 image.

## Verification

```bash
curl -sf http://localhost:3000/ | grep -q "Excalidraw" && echo "OK"
```
