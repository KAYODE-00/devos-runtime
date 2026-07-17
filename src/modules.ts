export const coreCapabilities = [
  "filesystem-inspection",
  "local-build",
  "local-test",
  "package-manager-detection",
  "runtime-detection",
] as const;

export type RuntimeCapability = (typeof coreCapabilities)[number];

export const optionalModules = [
  "docker",
  "git",
  "playwright",
  "local-ai",
  "postgresql",
  "redis",
] as const;
