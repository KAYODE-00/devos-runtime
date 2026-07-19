# DevOS Runtime

DevOS Runtime is the only DevOS component permitted to perform local machine
operations. It is a standalone Node.js and TypeScript service intended to run
on `127.0.0.1:3180`.

## Responsibilities

- Restricted local build and test jobs
- Workspace inspection, project requirement detection, and runtime health discovery
- Future Git, Docker, Playwright, module, and local AI adapters

The Runtime does not render a UI and is independent of Desktop, Web, and
extension repositories.

`POST /v1/workspaces/inspect` returns the detected package manager, project
features (such as Prisma or Playwright), required runtimes, and the installed
version/health of each required runtime. Detection is read-only; installation
and update adapters can be added without allowing arbitrary shell commands.

## Local setup

```bash
npm install
copy .env.example .env
npm run dev
```

Set the same `DEVOS_RUNTIME_TOKEN` in the local DevOS Web environment before
connecting Web to Runtime. The initial API intentionally exposes only health,
workspace inspection, and package-manager build/test jobs.

Set `DEVOS_RUNTIME_WORKSPACE_ROOTS` to the folders that may contain DevOS
projects. Runtime resolves real filesystem paths and rejects requests outside
these roots, including paths reached through symlinks.

## Local Docker services

Set `DEVOS_RUNTIME_DOCKER_ENABLED=true` only when Docker Desktop is installed
and running. The Runtime can then provision managed PostgreSQL 16 and Redis 7
containers only. They use loopback-only random host ports; Runtime never
accepts arbitrary Docker commands, images, ports, or environment variables.
