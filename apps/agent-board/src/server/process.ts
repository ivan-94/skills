import { log } from "./logger.ts";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function runCommand(
  command: string[],
  options: { cwd?: string } = {}
): Promise<CommandResult> {
  const startedAt = performance.now();
  const commandName = command.slice(0, 3).join(" ");
  try {
    const proc = Bun.spawn(command, {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe"
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    const result = {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode
    };
    log(exitCode === 0 ? "debug" : "warn", "command.finished", {
      command: commandName,
      cwd: options.cwd,
      exitCode,
      durationMs: Math.round(performance.now() - startedAt)
    });
    return result;
  } catch (error) {
    log("error", "command.spawn_error", {
      command: commandName,
      cwd: options.cwd,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: -1
    };
  }
}

export async function requireCommand(
  command: string[],
  options: { cwd?: string; label?: string } = {}
): Promise<string> {
  const result = await runCommand(command, { cwd: options.cwd });
  if (result.exitCode !== 0) {
    const label = options.label ?? command.join(" ");
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
