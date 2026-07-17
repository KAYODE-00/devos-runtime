import { z } from "zod";

const environmentSchema = z.object({
  DEVOS_RUNTIME_ORIGINS: z.string().default("http://localhost:3000"),
  DEVOS_RUNTIME_PORT: z.coerce.number().int().min(1).max(65_535).default(3180),
  DEVOS_RUNTIME_TOKEN: z.string().min(32),
});

export type RuntimeConfig = {
  origins: string[];
  port: number;
  token: string;
};

export function loadConfig(environment = process.env): RuntimeConfig {
  const parsed = environmentSchema.parse(environment);
  return {
    origins: parsed.DEVOS_RUNTIME_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    port: parsed.DEVOS_RUNTIME_PORT,
    token: parsed.DEVOS_RUNTIME_TOKEN,
  };
}
