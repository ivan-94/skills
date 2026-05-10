import { parse, stringify } from "yaml";
import { defaultRunnerConfigs, defaultTerminalConfig } from "./defaultConfig.ts";
import type { AgentBoardConfig, RunnerConfig, WorkflowConfig, WorkspaceConfig } from "../shared/types.ts";

export function serializeWorkflowConfig(config: WorkflowConfig): string {
  return stringify(config);
}

export function serializeAgentBoardConfig(config: AgentBoardConfig): string {
  return stringify(config);
}

export function parseAgentBoardConfig(raw: string): AgentBoardConfig {
  const parsed = parse(raw) as AgentBoardConfig;
  assertAgentBoardConfig(parsed);
  return withPresetAgentConfig(parsed);
}

export function defaultAgentBoardConfig(): AgentBoardConfig {
  return {
    version: 1,
    runners: defaultRunnerConfigs.map(cloneRunner),
    terminal: { ...defaultTerminalConfig },
    workspaces: []
  };
}

export function workflowFromBoards(boards: WorkflowConfig["boards"]): WorkflowConfig {
  return {
    version: 1,
    boards: JSON.parse(JSON.stringify(boards)) as WorkflowConfig["boards"]
  };
}

export function mergeWorkflowWithGlobalConfig(
  workflow: WorkflowConfig,
  globalConfig: Pick<AgentBoardConfig, "runners" | "terminal">
): WorkflowConfig {
  return {
    version: 1,
    boards: JSON.parse(JSON.stringify(workflow.boards)) as WorkflowConfig["boards"],
    runners: globalConfig.runners.map(cloneRunner),
    terminal: { ...globalConfig.terminal }
  };
}

function assertAgentBoardConfig(config: AgentBoardConfig): void {
  if (!config || config.version !== 1 || !Array.isArray(config.workspaces)) {
    throw new Error("Agent Board config must contain version: 1 and workspaces: [].");
  }
}

function withPresetAgentConfig(config: AgentBoardConfig): AgentBoardConfig {
  return {
    ...config,
    runners: Array.isArray(config.runners)
      ? withPresetRunnerConfig(config.runners)
      : defaultRunnerConfigs.map(cloneRunner),
    terminal: config.terminal ?? { ...defaultTerminalConfig },
    workspaces: Array.isArray(config.workspaces) ? config.workspaces.map(cloneWorkspace) : []
  };
}

function withPresetRunnerConfig(runners: RunnerConfig[]): RunnerConfig[] {
  const presets = new Map(defaultRunnerConfigs.map((runner) => [runner.id, runner]));
  return runners.map((runner) => {
    const preset = presets.get(runner.id);
    if (!preset) return runner;
    return {
      ...runner,
      defaultPermissionMode: runner.defaultPermissionMode ?? preset.defaultPermissionMode,
      permissionModes: runner.permissionModes ?? preset.permissionModes?.map((mode) => ({
        ...mode,
        args: [...mode.args]
      }))
    };
  });
}

function cloneRunner(runner: RunnerConfig): RunnerConfig {
  return {
    ...runner,
    args: [...runner.args],
    permissionModes: runner.permissionModes?.map((mode) => ({
      ...mode,
      args: [...mode.args]
    }))
  };
}

function cloneWorkspace(workspace: WorkspaceConfig): WorkspaceConfig {
  return { ...workspace };
}
