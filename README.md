# DevOS Runtime

DevOS Runtime is the only DevOS component permitted to perform local machine
operations. It is a standalone Node.js and TypeScript service intended to run
on `127.0.0.1:3180`.

## Responsibilities

- Restricted local build and test jobs
- Workspace inspection and runtime discovery
- Future Git, Docker, Playwright, module, and local AI adapters

The Runtime does not render a UI and is independent of Desktop, Web, and
extension repositories.

## Local setup

```bash
npm install
copy .env.example .env
npm run dev
```

Set the same `DEVOS_RUNTIME_TOKEN` in the local DevOS Web environment before
connecting Web to Runtime. The initial API intentionally exposes only health,
workspace inspection, and package-manager build/test jobs.
