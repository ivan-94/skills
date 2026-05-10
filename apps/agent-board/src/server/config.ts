import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { defaultRunnerConfigs, defaultTerminalConfig, defaultWorkflowConfig } from "./defaultConfig.ts";
import type { RunnerConfig, WorkflowConfig } from "../shared/types.ts";

export type LoadedConfig = {
  config: WorkflowConfig;
  source: "default" | "project";
  path: string;
};

export async function loadWorkflowConfig(gitRoot: string): Promise<LoadedConfig> {
  const configPath = join(gitRoot, ".agent-board.yml");
  if (!existsSync(configPath)) {
    return {
      config: cloneWorkflowConfig(defaultWorkflowConfig),
      source: "default",
      path: configPath
    };
  }

  const raw = await readFile(configPath, "utf8");
  const parsed = parse(raw) as WorkflowConfig;
  assertWorkflowConfig(parsed);

  return {
    config: withPresetConfig(parsed),
    source: "project",
    path: configPath
  };
}

export function serializeWorkflowConfig(config: WorkflowConfig): string {
  return stringify(config);
}

function assertWorkflowConfig(config: WorkflowConfig): void {
  if (!config || config.version !== 1 || !Array.isArray(config.boards)) {
    throw new Error(".agent-board.yml must contain version: 1 and boards: []");
  }
}

function withPresetConfig(config: WorkflowConfig): WorkflowConfig {
  return {
    ...config,
    runners: Array.isArray(config.runners)
      ? withPresetRunnerConfig(config.runners)
      : defaultRunnerConfigs.map((runner) => ({ ...runner, args: [...runner.args] })),
    terminal: config.terminal ?? { ...defaultTerminalConfig }
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

function cloneWorkflowConfig(config: WorkflowConfig): WorkflowConfig {
  return JSON.parse(JSON.stringify(config)) as WorkflowConfig;
}
