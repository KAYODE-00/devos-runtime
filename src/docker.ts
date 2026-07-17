import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const executeFile = promisify(execFile);

const provisionSchema = z.object({
  projectId: z.string().uuid(),
  service: z.enum(["postgres", "redis"]),
});

const services = {
  postgres: { image: "postgres:16-alpine", containerPort: 5432 },
  redis: { image: "redis:7-alpine", containerPort: 6379 },
} as const;

type DockerService = keyof typeof services;

const serviceSchema = z.object({
  projectId: z.string().uuid(),
  service: z.enum(["postgres", "redis"]),
});

async function docker(args: string[]) {
  return executeFile("docker", args, { windowsHide: true, maxBuffer: 32_000 });
}

function containerName(projectId: string, service: DockerService) {
  return `devos-${service}-${projectId.replaceAll("-", "")}`;
}

async function containerExists(name: string) {
  try {
    await docker(["container", "inspect", name]);
    return true;
  } catch {
    return false;
  }
}

async function mappedPort(name: string, containerPort: number) {
  const { stdout } = await docker(["port", name, containerPort + "/tcp"]);
  const match = stdout.match(/:(\d+)\s*$/m);
  if (!match) throw new Error("Docker did not return a local service port.");
  return Number(match[1]);
}

export async function getDockerStatus(enabled: boolean) {
  if (!enabled) return { available: false, enabled: false };
  try {
    const { stdout } = await docker(["version", "--format", "{{.Server.Version}}"]); 
    return { available: true, enabled: true, version: stdout.trim() };
  } catch {
    return { available: false, enabled: true };
  }
}

export async function provisionDockerService(rawInput: unknown, enabled: boolean) {
  if (!enabled) throw new Error("Docker provisioning is disabled. Set DEVOS_RUNTIME_DOCKER_ENABLED=true to enable it.");
  const input = provisionSchema.parse(rawInput);
  const status = await getDockerStatus(enabled);
  if (!status.available) throw new Error("Docker Desktop is not available on this device.");

  const definition = services[input.service];
  const name = containerName(input.projectId, input.service);
  if (await containerExists(name)) {
    const port = await mappedPort(name, definition.containerPort);
    return {
      connection: input.service === "postgres"
        ? { host: "127.0.0.1", port, service: "postgres", username: "postgres" }
        : { host: "127.0.0.1", port, service: "redis" },
      created: false,
      status: "ready" as const,
    };
  }

  const args = ["run", "--detach", "--name", name, "--label", "devos.managed=true", "--publish", "127.0.0.1::" + definition.containerPort];
  let password: string | undefined;
  if (input.service === "postgres") {
    password = randomBytes(24).toString("base64url");
    args.push("--env", "POSTGRES_PASSWORD=" + password);
  }
  args.push(definition.image);
  await docker(args);
  const port = await mappedPort(name, definition.containerPort);

  return {
    connection: input.service === "postgres"
      ? { host: "127.0.0.1", port, service: "postgres", username: "postgres", password }
      : { host: "127.0.0.1", port, service: "redis" },
    created: true,
    status: "ready" as const,
  };
}

export async function listDockerServices(projectId: string, enabled: boolean) {
  if (!enabled) return [];
  const parsedProjectId = z.string().uuid().parse(projectId);
  const status = await getDockerStatus(enabled);
  if (!status.available) throw new Error("Docker Desktop is not available on this device.");

  return Promise.all((Object.keys(services) as DockerService[]).map(async (service) => {
    const definition = services[service];
    const name = containerName(parsedProjectId, service);
    if (!(await containerExists(name))) return { service, status: "missing" as const };
    const port = await mappedPort(name, definition.containerPort).catch(() => null);
    return { service, status: "running" as const, port };
  }));
}

export async function removeDockerService(rawInput: unknown, enabled: boolean) {
  if (!enabled) throw new Error("Docker provisioning is disabled. Set DEVOS_RUNTIME_DOCKER_ENABLED=true to enable it.");
  const input = serviceSchema.parse(rawInput);
  const status = await getDockerStatus(enabled);
  if (!status.available) throw new Error("Docker Desktop is not available on this device.");
  const name = containerName(input.projectId, input.service);
  if (!(await containerExists(name))) return { removed: false };
  await docker(["rm", "--force", name]);
  return { removed: true };
}
