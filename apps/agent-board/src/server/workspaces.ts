import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { defaultWorkflowConfig } from "./defaultConfig.ts";
import {
  defaultAgentBoardConfig,
  mergeWorkflowWithGlobalConfig,
  parseAgentBoardConfig,
  serializeAgentBoardConfig,
  serializeWorkflowConfig,
  workflowFromBoards
} from "./config.ts";
import { fetchRepo } from "./github.ts";
import { findFirstGithubRemote, findGitRoot } from "./git.ts";
import { log, time } from "./logger.ts";
import { parse } from "yaml";
import type { AgentBoardConfig, WorkflowConfig, WorkspaceConfig } from "../shared/types.ts";

export type LoadedWorkspaceWorkflow = {
  config: WorkflowConfig;
  source: "default" | "workspace";
  path: string;
};

const agentBoardDir = process.env.AGENT_BOARD_HOME || join(homedir(), ".agent-board");
const configPath = join(agentBoardDir, "config.yml");
const workspacesDir = join(agentBoardDir, "workspaces");

export async function loadAgentBoardConfig(): Promise<AgentBoardConfig> {
  await mkdir(agentBoardDir, { recursive: true });
  if (!existsSync(configPath)) {
    const appConfig = defaultAgentBoardConfig();
    await saveAgentBoardConfig(appConfig);
    return appConfig;
  }

  const raw = await readFile(configPath, "utf8");
  return parseAgentBoardConfig(raw);
}

export async function saveAgentBoardConfig(config: AgentBoardConfig): Promise<void> {
  await mkdir(agentBoardDir, { recursive: true });
  await writeFile(configPath, serializeAgentBoardConfig(config));
}

export async function loadWorkspaceWorkflow(
  workspace: WorkspaceConfig,
  appConfig: AgentBoardConfig
): Promise<LoadedWorkspaceWorkflow> {
  const path = workspaceWorkflowPath(workspace.id);
  if (!existsSync(path)) {
    const workflow = workflowFromBoards(defaultWorkflowConfig.boards);
    await saveWorkspaceWorkflow(workspace.id, workflow);
    return {
      config: mergeWorkflowWithGlobalConfig(workflow, appConfig),
      source: "default",
      path
    };
  }

  const raw = await readFile(path, "utf8");
  const parsed = parse(raw) as WorkflowConfig;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.boards)) {
    throw new Error(`Invalid workspace workflow: ${path}`);
  }

  return {
    config: mergeWorkflowWithGlobalConfig(parsed, appConfig),
    source: "workspace",
    path
  };
}

export async function saveWorkspaceWorkflow(workspaceId: string, workflow: WorkflowConfig): Promise<string> {
  const path = workspaceWorkflowPath(workspaceId);
  await mkdir(join(workspacesDir, workspaceId), { recursive: true });
  await writeFile(path, serializeWorkflowConfig(workflowFromBoards(workflow.boards)));
  return path;
}

export async function addWorkspace(inputPath: string, name?: string): Promise<WorkspaceConfig> {
  return time("workspace.add", { path: inputPath }, async () => {
    const gitRoot = await findGitRoot(resolve(inputPath));
    const remote = await findFirstGithubRemote(gitRoot);
    const repo = await fetchRepo(remote.slug);
    const id = workspaceIdForPath(gitRoot);
    const currentConfig = await loadAgentBoardConfig();
    const existing = currentConfig.workspaces.find((workspace) => workspace.id === id);
    const workspace: WorkspaceConfig = existing ?? {
      id,
      name: name?.trim() || repo.nameWithOwner.split("/")[1] || basename(gitRoot),
      gitRoot,
      repoSlug: remote.slug,
      repoUrl: repo.url
    };
    if (name?.trim()) workspace.name = name.trim();

    const workspaces = [
      workspace,
      ...currentConfig.workspaces.filter((candidate) => candidate.id !== id)
    ];
    const nextConfig: AgentBoardConfig = {
      ...currentConfig,
      lastUsedWorkspaceId: id,
      workspaces
    };
    await saveAgentBoardConfig(nextConfig);
    await ensureWorkspaceWorkflow(id);
    log("info", "workspace.added", { id, gitRoot, repo: remote.slug });
    return workspace;
  });
}

export async function updateWorkspace(id: string, patch: { name?: string }): Promise<WorkspaceConfig> {
  const currentConfig = await loadAgentBoardConfig();
  const workspaces = currentConfig.workspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, name: patch.name?.trim() || workspace.name } : workspace
  );
  const updated = workspaces.find((workspace) => workspace.id === id);
  if (!updated) throw new Error(`Workspace not found: ${id}`);
  const nextConfig = { ...currentConfig, workspaces };
  await saveAgentBoardConfig(nextConfig);
  return updated;
}

export async function removeWorkspace(id: string): Promise<AgentBoardConfig> {
  const currentConfig = await loadAgentBoardConfig();
  const workspaces = currentConfig.workspaces.filter((workspace) => workspace.id !== id);
  const lastUsedWorkspaceId =
    currentConfig.lastUsedWorkspaceId === id ? workspaces[0]?.id : currentConfig.lastUsedWorkspaceId;
  const nextConfig = { ...currentConfig, lastUsedWorkspaceId, workspaces };
  await saveAgentBoardConfig(nextConfig);
  return nextConfig;
}

export async function setLastUsedWorkspace(id: string): Promise<AgentBoardConfig> {
  const currentConfig = await loadAgentBoardConfig();
  if (!currentConfig.workspaces.some((workspace) => workspace.id === id)) {
    throw new Error(`Workspace not found: ${id}`);
  }
  const nextConfig = { ...currentConfig, lastUsedWorkspaceId: id };
  await saveAgentBoardConfig(nextConfig);
  return nextConfig;
}

export function selectWorkspace(config: AgentBoardConfig, requestedId?: string | null): WorkspaceConfig | null {
  if (!config.workspaces.length) return null;
  return (
    (requestedId ? config.workspaces.find((workspace) => workspace.id === requestedId) : null) ??
    (config.lastUsedWorkspaceId ? config.workspaces.find((workspace) => workspace.id === config.lastUsedWorkspaceId) : null) ??
    config.workspaces[0] ??
    null
  );
}

export function workspaceIdForPath(path: string): string {
  return createHash("sha1").update(resolve(path)).digest("hex").slice(0, 16);
}

function workspaceWorkflowPath(workspaceId: string): string {
  return join(workspacesDir, workspaceId, "workflow.yml");
}

async function ensureWorkspaceWorkflow(workspaceId: string): Promise<void> {
  const path = workspaceWorkflowPath(workspaceId);
  if (existsSync(path)) return;
  await saveWorkspaceWorkflow(workspaceId, workflowFromBoards(defaultWorkflowConfig.boards));
}
