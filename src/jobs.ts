import { access, realpath, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { z } from "zod";

const jobSchema = z.object({
  kind: z.enum(["build", "test"]),
  workspacePath: z.string().trim().min(1).max(2_048),
});

export type RuntimeJobInput = z.infer<typeof jobSchema>;
export type RuntimeJobResult = {
  command: string;
  exitCode: number | null;
  kind: RuntimeJobInput["kind"];
  output: string;
};

async function exists(path: string) {
  await access(path, constants.F_OK);
  return true;
}

async function assertWorkspaceAllowed(workspacePath: string, workspaceRoots: string[]) {
  const resolvedWorkspacePath = await realpath(workspacePath).catch(() => null);
  if (!resolvedWorkspacePath) {
    throw new Error("The configured workspace folder is unavailable on this device.");
  }

  const resolvedRoots = await Promise.all(
    workspaceRoots.map((workspaceRoot) => realpath(workspaceRoot).catch(() => null))
  );
  const isAllowed = resolvedRoots.some((workspaceRoot) => {
    if (!workspaceRoot) return false;
    const relativePath = relative(workspaceRoot, resolvedWorkspacePath);
    return relativePath === "" || (!relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && relativePath !== ".." && !isAbsolute(relativePath));
  });

  if (!isAllowed) {
    throw new Error("The workspace is outside the Runtime's approved workspace roots.");
  }

  return resolvedWorkspacePath;
}

async function packageManager(workspacePath: string) {
  const candidates = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"],
  ] as const;
  for (const [lockfile, manager] of candidates) {
    try {
      await exists(join(workspacePath, lockfile));
      return manager;
    } catch {}
  }
  return "npm";
}

function run(program: string, args: string[], workspacePath: string, kind: RuntimeJobInput["kind"]): Promise<RuntimeJobResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: workspacePath, shell: process.platform === "win32" });
    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < 20_000) output += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => reject(new Error(`Unable to start local ${kind}: ${error.message}`)));
    child.once("close", (exitCode) => resolve({ command: `${program} ${args.join(" ")}`, exitCode, kind, output: output.slice(0, 20_000) }));
  });
}

export async function runPackageJob(rawInput: unknown, workspaceRoots: string[]): Promise<RuntimeJobResult> {
  const input = jobSchema.parse(rawInput);
  const workspacePath = await assertWorkspaceAllowed(input.workspacePath, workspaceRoots);
  const metadata = await stat(workspacePath);
  if (!metadata.isDirectory()) throw new Error("The configured workspace folder is unavailable on this device.");
  try {
    await exists(join(workspacePath, "package.json"));
  } catch {
    throw new Error("Local build and test jobs require a package.json workspace.");
  }
  const manager = await packageManager(workspacePath);
  const args = manager === "yarn" ? [input.kind] : ["run", input.kind];
  return run(manager, args, workspacePath, input.kind);
}

export async function inspectWorkspace(rawWorkspacePath: string, workspaceRoots: string[]) {
  const workspacePath = await assertWorkspaceAllowed(rawWorkspacePath, workspaceRoots);
  const metadata = await stat(workspacePath);
  if (!metadata.isDirectory()) throw new Error("The configured workspace folder is unavailable on this device.");
  return {
    packageManager: await packageManager(workspacePath),
    path: workspacePath,
  };
}
