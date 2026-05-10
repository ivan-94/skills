import type { Runner, RunnerConfig } from "../shared/types.ts";
import { defaultRunnerConfigs } from "./defaultConfig.ts";
import { log, time } from "./logger.ts";
import { runCommand } from "./process.ts";

export async function detectRunners(configuredRunners: RunnerConfig[] | undefined): Promise<Runner[]> {
  return time("runners.detect", {}, async () => {
    const configs = configuredRunners ?? defaultRunnerConfigs;
    const runners = await Promise.all(
      configs.map(async (runner) => ({
        ...runner,
        detected: runner.command.trim().length > 0 ? await commandDetected(runner.command) : false
      }))
    );
    log("info", "runners.detected", {
      runnerIds: runners.map((runner) => runner.id),
      detectedCount: runners.filter((runner) => runner.detected).length
    });
    return runners;
  });
}

export function chooseDefaultRunner(runners: Runner[]): string {
  return runners.find((runner) => runner.detected)?.id ?? runners[0]?.id ?? "";
}

async function commandDetected(command: string): Promise<boolean> {
  const result = await runCommand(["which", command]);
  return result.exitCode === 0;
}
