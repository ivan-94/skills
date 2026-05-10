import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TerminalConfig, TerminalTool } from "../shared/types.ts";
import { defaultTerminalConfig } from "./defaultConfig.ts";
import { log, time } from "./logger.ts";
import { runCommand } from "./process.ts";
import { shellQuote } from "./shell.ts";

type TerminalToolPreset = Omit<TerminalTool, "detected"> & {
  appNames: string[];
  bundleIds: string[];
};

const terminalToolPresets: TerminalToolPreset[] = [
  {
    id: "system",
    label: "System Terminal",
    appName: "Terminal",
    appNames: ["Terminal"],
    bundleIds: ["com.apple.Terminal"],
    supportsTabs: true
  },
  {
    id: "iterm",
    label: "iTerm2",
    appName: "iTerm",
    appNames: ["iTerm", "iTerm2"],
    bundleIds: ["com.googlecode.iterm2"],
    supportsTabs: true
  },
  {
    id: "warp",
    label: "Warp",
    appName: "Warp",
    appNames: ["Warp"],
    bundleIds: ["dev.warp.Warp-Stable"],
    supportsTabs: false
  },
  {
    id: "ghostty",
    label: "Ghostty",
    appName: "Ghostty",
    appNames: ["Ghostty"],
    bundleIds: ["com.mitchellh.ghostty"],
    supportsTabs: false
  }
];

export async function detectTerminalTools(): Promise<TerminalTool[]> {
  return time("terminal.detect", {}, async () => {
    const tools = await Promise.all(
      terminalToolPresets.map(async (tool) => ({
        id: tool.id,
        label: tool.label,
        appName: tool.appName,
        supportsTabs: tool.supportsTabs,
        detected: await appDetected(tool)
      }))
    );
    log("info", "terminal.detected", {
      terminalIds: tools.map((tool) => tool.id),
      detectedIds: tools.filter((tool) => tool.detected).map((tool) => tool.id)
    });
    return tools;
  });
}

export async function openTerminal(
  scriptPath: string,
  config: TerminalConfig | undefined,
  tools: TerminalTool[]
): Promise<boolean> {
  if (process.platform !== "darwin") {
    throw new Error("Terminal launch is only implemented for macOS in v1.");
  }

  const terminalConfig = config ?? defaultTerminalConfig;
  const tool = tools.find((candidate) => candidate.id === terminalConfig.id);
  if (!tool) throw new Error(`Terminal tool not found: ${terminalConfig.id}`);
  if (!tool.detected) throw new Error(`${tool.label} was not detected on this machine.`);

  const openMode = terminalConfig.openMode === "tab" && tool.supportsTabs ? "tab" : "window";
  await time("terminal.open", { scriptPath, terminalId: tool.id, openMode }, async () => {
    if (tool.id === "system") {
      await openSystemTerminal(scriptPath, openMode);
    } else if (tool.id === "iterm") {
      await openIterm(scriptPath, openMode);
    } else if (tool.id === "ghostty") {
      await openGhostty(scriptPath);
    } else {
      await openWithApplication(tool.appName, scriptPath);
    }
    log("info", "terminal.opened", { scriptPath, terminalId: tool.id, openMode });
  });

  return true;
}

async function appDetected(tool: TerminalToolPreset): Promise<boolean> {
  if (tool.id === "system" && process.platform === "darwin") return true;
  if (tool.appNames.some((appName) => appPathExists(appName))) return true;

  for (const bundleId of tool.bundleIds) {
    const result = await runCommand(["mdfind", `kMDItemCFBundleIdentifier == '${bundleId}'`]);
    if (result.exitCode === 0 && result.stdout.trim().length > 0) return true;
  }

  for (const appName of tool.appNames) {
    const result = await runCommand(["mdfind", `kMDItemFSName == '${appName}.app'`]);
    if (result.exitCode === 0 && result.stdout.trim().length > 0) return true;
  }

  return false;
}

function appPathExists(appName: string): boolean {
  return [
    join("/Applications", `${appName}.app`),
    join(homedir(), "Applications", `${appName}.app`)
  ].some((path) => existsSync(path));
}

async function openSystemTerminal(scriptPath: string, openMode: "window" | "tab"): Promise<void> {
  const command = `bash ${shellQuote(scriptPath)}`;
  const lines = openMode === "tab"
    ? [
        "tell application \"Terminal\"",
        "activate",
        `if (count of windows) is 0 then`,
        `do script ${appleScriptString(command)}`,
        "else",
        `do script ${appleScriptString(command)} in front window`,
        "end if",
        "end tell"
      ]
    : [
        "tell application \"Terminal\"",
        "activate",
        `do script ${appleScriptString(command)}`,
        "end tell"
      ];

  await runAppleScript(lines, "System Terminal");
}

async function openIterm(scriptPath: string, openMode: "window" | "tab"): Promise<void> {
  const command = `bash ${shellQuote(scriptPath)}`;
  const lines = openMode === "tab"
    ? [
        "tell application \"iTerm\"",
        "activate",
        "if (count of windows) is 0 then",
        "create window with default profile",
        "else",
        "tell current window to create tab with default profile",
        "end if",
        `tell current session of current window to write text ${appleScriptString(command)}`,
        "end tell"
      ]
    : [
        "tell application \"iTerm\"",
        "activate",
        "create window with default profile",
        `tell current session of current window to write text ${appleScriptString(command)}`,
        "end tell"
      ];

  await runAppleScript(lines, "iTerm2");
}

async function openWithApplication(appName: string, scriptPath: string): Promise<void> {
  const result = await runCommand(["open", "-a", appName, scriptPath]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to open ${appName}.`);
  }
}

async function openGhostty(scriptPath: string): Promise<void> {
  const result = await runCommand(["open", "-na", "Ghostty", "--args", "-e", "bash", scriptPath]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to open Ghostty.");
  }
}

async function runAppleScript(lines: string[], label: string): Promise<void> {
  const result = await runCommand(["osascript", ...lines.flatMap((line) => ["-e", line])]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to open ${label}.`);
  }
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}
