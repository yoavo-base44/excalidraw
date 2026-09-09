# AGENTS.md

## Project Structure

Excalidraw is a **monorepo** with a clear separation between the core library and the application:

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`excalidraw-app/`** - Full-featured web application (excalidraw.com) that uses the library
- **`packages/`** - Core packages: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`
- **`examples/`** - Integration examples (NextJS, browser script)

## Development Setup (Base44)

- `docker compose -f docker-compose.base44.yml up -d` to start
- Vite dev server runs on port 3000 with hot reload
- ESLint is disabled in dev for faster startup (`VITE_APP_ENABLE_ESLINT=false`)
- PWA is disabled in dev (`VITE_APP_ENABLE_PWA=false`)
- node_modules are in a named Docker volume to avoid host mount conflicts

## Quirks

- The `yarn start` script runs `yarn --cwd ./excalidraw-app start`, which itself runs `yarn && vite` (re-validates deps then starts vite)
- Env files (`.env.development`, etc.) live at the repo root and vite loads them via `envDir: "../"` in `excalidraw-app/vite.config.mts`
- The `VITE_APP_PORT` env var controls the dev server port (set to 3000 for Base44)
- Firebase config is baked into `.env.development` (public API keys for the OSS dev project)
- Collaboration features require a separate WebSocket server (`excalidraw-room`) not included here

## Testing

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```
