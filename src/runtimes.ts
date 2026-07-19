import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const executeFile = promisify(execFile);

type RuntimeName = "node" | "npm" | "pnpm" | "yarn" | "bun" | "deno" | "python" | "rust" | "go" | "java" | "php" | "ruby" | "flutter" | "docker" | "git";

const commands: Record<RuntimeName, { command: string; args: string[] }> = {
  node: { command: "node", args: ["--version"] }, npm: { command: "npm", args: ["--version"] },
  pnpm: { command: "pnpm", args: ["--version"] }, yarn: { command: "yarn", args: ["--version"] },
  bun: { command: "bun", args: ["--version"] }, deno: { command: "deno", args: ["--version"] },
  python: { command: process.platform === "win32" ? "py" : "python3", args: ["--version"] },
  rust: { command: "rustc", args: ["--version"] }, go: { command: "go", args: ["version"] },
  java: { command: "java", args: ["-version"] }, php: { command: "php", args: ["--version"] },
  ruby: { command: "ruby", args: ["--version"] }, flutter: { command: "flutter", args: ["--version"] },
  docker: { command: "docker", args: ["--version"] }, git: { command: "git", args: ["--version"] },
};

const requirementFiles: Record<string, string> = {
  "package.json": "node", "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn", "bun.lock": "bun", "bun.lockb": "bun",
  "requirements.txt": "python", "pyproject.toml": "python", "Cargo.toml": "rust", "go.mod": "go",
  "pom.xml": "java", "composer.json": "php", "Gemfile": "ruby", "pubspec.yaml": "flutter",
  "docker-compose.yml": "docker", "docker-compose.yaml": "docker", ".git": "git",
};

const featureFiles: Record<string, string> = {
  "schema.prisma": "prisma", "playwright.config.ts": "playwright", "playwright.config.js": "playwright",
  "vitest.config.ts": "vitest", "jest.config.js": "jest", "cypress.config.ts": "cypress",
};

async function has(path: string) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function checkRuntime(name: RuntimeName) {
  const definition = commands[name];
  try {
    const { stdout, stderr } = await executeFile(definition.command, definition.args, { windowsHide: true, timeout: 5_000 });
    const version = (stdout || stderr).split(/\r?\n/).find(Boolean)?.trim() ?? "unknown";
    return { name, installed: true, healthy: true, version };
  } catch { return { name, installed: false, healthy: false, version: null }; }
}

export async function detectWorkspace(workspacePath: string) {
  const requirements: string[] = [];
  const features: string[] = [];
  for (const [file, runtime] of Object.entries(requirementFiles)) if (await has(join(workspacePath, file))) requirements.push(runtime);
  for (const [file, feature] of Object.entries(featureFiles)) if (await has(join(workspacePath, file))) features.push(feature);
  const packageJsonPath = join(workspacePath, "package.json");
  if (await has(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
      const packages = new Set([...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})]);
      if (["next", "react", "vite"].some((pkg) => packages.has(pkg))) requirements.push("node");
      if (packages.has("prisma") || packages.has("@prisma/client")) features.push("prisma");
      if (packages.has("playwright") || packages.has("@playwright/test")) features.push("playwright");
    } catch { /* inspection remains useful when package.json is malformed */ }
  }
  const uniqueRequirements = [...new Set(requirements)] as RuntimeName[];
  const runtimes = await Promise.all(uniqueRequirements.map(checkRuntime));
  return { requirements: uniqueRequirements, features: [...new Set(features)], runtimes };
}
