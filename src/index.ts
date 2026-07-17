import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError, z } from "zod";
import { loadConfig } from "./config.js";
import { inspectWorkspace, runPackageJob } from "./jobs.js";
import { coreCapabilities, optionalModules } from "./modules.js";

const config = loadConfig();
const app = Fastify({ logger: true });

await app.register(cors, {
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || config.origins.includes(origin));
  },
});

app.get("/health", async () => ({
  capabilities: coreCapabilities,
  modules: { installed: [], available: optionalModules },
  service: "devos-runtime",
  version: "0.1.0",
}));

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${config.token}`) {
    await reply.code(401).send({ message: "Runtime authentication required." });
  }
});

app.post("/v1/workspaces/inspect", async (request, reply) => {
  try {
    const body = z.object({ workspacePath: z.string().trim().min(1).max(2_048) }).parse(request.body);
    return await inspectWorkspace(body.workspacePath);
  } catch (error) {
    return reply.code(400).send({ message: error instanceof Error ? error.message : "Invalid workspace request." });
  }
});

app.post("/v1/jobs", async (request, reply) => {
  try {
    return await runPackageJob(request.body);
  } catch (error) {
    const message = error instanceof ZodError ? "Invalid local job request." : error instanceof Error ? error.message : "Local job failed.";
    return reply.code(400).send({ message });
  }
});

await app.listen({ host: "127.0.0.1", port: config.port });
