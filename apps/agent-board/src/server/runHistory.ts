import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RunRequest, RunStatus, Runner } from "../shared/types.ts";
import { log, time } from "./logger.ts";
import { renderArgs, shellQuote } from "./shell.ts";

export type CreatedRun = {
  runId: string;
  runDir: string;
  recordPath: string;
  statusPath: string;
  scriptPath: string;
  script: string;
};

const agentBoardDir = process.env.AGENT_BOARD_HOME || join(homedir(), ".agent-board");

export async function createRunArtifacts(
  workspaceId: string,
  request: RunRequest,
  runner: Runner
): Promise<CreatedRun> {
  return time("run.create_artifacts", {
    workspaceId,
    actionId: request.actionId,
    runnerId: runner.id,
    selectedCount: request.selectedRefs.length
  }, async () => {
    const runId = createRunId(request.actionId, request.selectedRefs);
    const runDir = join(agentBoardDir, "runs", workspaceId);
    const recordPath = join(runDir, `${runId}.json`);
    const statusPath = join(runDir, `${runId}.status.json`);
    const scriptPath = join(runDir, `${runId}.sh`);
    const permissionMode = resolvePermissionMode(runner, request.permissionModeId);
    const permissionArgs = permissionMode ? renderArgs(permissionMode.args, request.prompt) : [];
    const args = [...permissionArgs, ...renderArgs(runner.args, request.prompt)];
    const command = runner.command;
    const script = renderRunScript(runId, statusPath, request.cwd, command, args);

    await mkdir(runDir, { recursive: true });
    await writeFile(
      recordPath,
      JSON.stringify(
        {
          id: runId,
          startedAt: new Date().toISOString(),
          workspaceId,
          gitRoot: request.cwd,
          boardId: request.boardId,
          laneId: request.laneId,
          actionId: request.actionId,
          actionTitle: request.actionTitle,
          selectedRefs: request.selectedRefs,
          selectedItems: request.selectedItems,
          runnerId: request.runnerId,
          permissionModeId: permissionMode?.id ?? request.permissionModeId ?? null,
          command,
          args,
          prompt: request.prompt,
          statusPath,
          scriptPath
        },
        null,
        2
      )
    );
    await writeFile(statusPath, JSON.stringify({
      runId,
      status: "pending",
      updatedAt: new Date().toISOString()
    }, null, 2));
    await writeFile(scriptPath, script, { mode: 0o755 });

    log("info", "run.artifacts_created", { runId, recordPath, scriptPath });
    return {
      runId,
      runDir,
      recordPath,
      statusPath,
      scriptPath,
      script
    };
  });
}

function resolvePermissionMode(runner: Runner, requestedModeId: string | undefined) {
  const modes = runner.permissionModes ?? [];
  if (!modes.length) return null;
  const modeId = requestedModeId || runner.defaultPermissionMode || "default";
  return modes.find((mode) => mode.id === modeId) ?? modes.find((mode) => mode.id === "default") ?? modes[0] ?? null;
}

export async function readRunStatuses(workspaceId: string, runIds: string[]): Promise<RunStatus[]> {
  const runDir = join(agentBoardDir, "runs", workspaceId);
  return Promise.all(runIds.map(async (runId) => {
    const statusPath = join(runDir, `${runId}.status.json`);
    if (!existsSync(statusPath)) return { runId, status: "unknown" };
    try {
      const status = await Bun.file(statusPath).json() as RunStatus;
      return {
        runId,
        status: status.status ?? "unknown",
        pid: status.pid,
        exitCode: status.exitCode,
        startedAt: status.startedAt,
        updatedAt: status.updatedAt,
        endedAt: status.endedAt
      };
    } catch {
      return { runId, status: "unknown" };
    }
  }));
}

function createRunId(actionId: string, selectedRefs: string[]): string {
  const stamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "")
    .replace("T", "-")
    .replace("Z", "");
  const actionSlug = slugify(actionId);
  const refSlug = slugify(selectedRefs.join("-")).slice(0, 48) || "items";
  const unique = randomUUID().slice(0, 8);
  return `${stamp}-${actionSlug}-${refSlug}-${unique}`;
}

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function renderRunScript(runId: string, statusPath: string, cwd: string, command: string, args: string[]): string {
  const renderedCommand = [command, ...args].map(shellQuote).join(" ");

  return `#!/usr/bin/env bash
set -euo pipefail

write_status() {
  local status="$1"
  local exit_code="\${2:-}"
  local now
  local status_json
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [ "$status" = "running" ]; then
    status_json='"running"'
  elif [ "$status" = "exited" ]; then
    status_json='"exited"'
  else
    status_json='"unknown"'
  fi
  if [ -n "$exit_code" ]; then
    printf '{"runId":%s,"status":%s,"pid":%s,"exitCode":%s,"updatedAt":%s,"endedAt":%s}\\n' \\
      ${shellQuote(JSON.stringify(runId))} \\
      "$status_json" \\
      "$$" \\
      "$exit_code" \\
      "$(printf '"%s"' "$now")" \\
      "$(printf '"%s"' "$now")" \\
      > ${shellQuote(statusPath)}
  else
    printf '{"runId":%s,"status":%s,"pid":%s,"startedAt":%s,"updatedAt":%s}\\n' \\
      ${shellQuote(JSON.stringify(runId))} \\
      "$status_json" \\
      "$$" \\
      "$(printf '"%s"' "$now")" \\
      "$(printf '"%s"' "$now")" \\
      > ${shellQuote(statusPath)}
  fi
}

cd ${shellQuote(cwd)}

write_status running
set +e
${renderedCommand}
exit_code=$?
set -e
write_status exited "$exit_code"

exec "\${SHELL:-/bin/zsh}" -l
`;
}
