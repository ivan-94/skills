import type { RunnerConfig, TerminalConfig, WorkflowConfig } from "../shared/types.ts";

export const defaultRunnerConfigs: RunnerConfig[] = [
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    args: ["{{prompt}}"],
    defaultPermissionMode: "default",
    permissionModes: [
      {
        id: "default",
        label: "Default",
        args: [],
        description: "Use Codex CLI defaults from config.toml."
      },
      {
        id: "auto-review",
        label: "Auto Review",
        args: ["--ask-for-approval", "on-request", "--sandbox", "workspace-write"],
        description: "Workspace-write sandbox; Codex asks when it decides approval is needed."
      },
      {
        id: "full-access",
        label: "All Permissions",
        args: ["--dangerously-bypass-approvals-and-sandbox"],
        description: "Bypass approvals and sandbox. Use only in an isolated workspace."
      }
    ]
  },
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    args: ["{{prompt}}"],
    defaultPermissionMode: "default",
    permissionModes: [
      {
        id: "default",
        label: "Default",
        args: ["--permission-mode", "default"],
        description: "Reads run without prompts; writes and commands ask for approval."
      },
      {
        id: "auto-review",
        label: "Auto Review",
        args: ["--permission-mode", "auto"],
        description: "Claude Code auto mode routes actions through its safety classifier."
      },
      {
        id: "full-access",
        label: "All Permissions",
        args: ["--permission-mode", "bypassPermissions"],
        description: "Bypass permission checks. Use only in an isolated workspace."
      }
    ]
  }
];

export const defaultTerminalConfig: TerminalConfig = {
  id: "system",
  openMode: "window"
};

export const defaultWorkflowConfig: WorkflowConfig = {
  version: 1,
  runners: defaultRunnerConfigs,
  terminal: defaultTerminalConfig,
  boards: [
    {
      id: "issues",
      title: "Issues",
      itemType: "issue",
      lanes: [
        {
          id: "inbox",
          title: "Inbox",
          query: {
            labelsNone: ["needs-info", "ready-for-agent", "ready-for-human", "wontfix"]
          },
          actions: [
            {
              id: "triage",
              title: "分诊",
              promptTemplate: "/triage 对以下 Issue 进行分诊：{{refs}}"
            }
          ]
        },
        {
          id: "needs-info",
          title: "Needs Info",
          query: {
            labelsAll: ["needs-info"]
          },
          actions: []
        },
        {
          id: "ready-for-agent",
          title: "Ready For Agent",
          query: {
            labelsAll: ["ready-for-agent"]
          },
          actions: [
            {
              id: "deliver",
              title: "Deliver",
              promptTemplate: "/deliver-issue {{refs}}"
            },
            {
              id: "tdd",
              title: "TDD",
              promptTemplate: "/tdd {{ref}}"
            }
          ]
        },
        {
          id: "ready-for-human",
          title: "Ready For Human",
          query: {
            labelsAll: ["ready-for-human"]
          },
          actions: []
        }
      ]
    },
    {
      id: "pull-requests",
      title: "Pull Requests",
      itemType: "pullRequest",
      lanes: [
        {
          id: "initial",
          title: "Initial",
          query: {
            labelsNone: [
              "HAT-Ready",
              "HAT-Needs-Human",
              "HAT-Blocked",
              "HAT-Passed"
            ]
          },
          actions: []
        },
        {
          id: "hat-ready",
          title: "HAT Ready",
          query: {
            labelsAll: ["HAT-Ready"]
          },
          actions: [
            {
              id: "hat-dispatch",
              title: "执行 HAT",
              promptTemplate: "/hat-dispatch {{refs}}"
            }
          ]
        },
        {
          id: "hat-needs-human",
          title: "HAT Needs Human",
          query: {
            labelsAll: ["HAT-Needs-Human"]
          },
          actions: []
        },
        {
          id: "hat-blocked",
          title: "HAT Blocked",
          query: {
            labelsAll: ["HAT-Blocked"]
          },
          actions: []
        },
        {
          id: "hat-passed",
          title: "HAT Passed",
          query: {
            labelsAll: ["HAT-Passed"]
          },
          actions: []
        }
      ]
    }
  ]
};

export function labelsReferencedByConfig(config: WorkflowConfig): string[] {
  const labels = new Set<string>();

  for (const board of config.boards) {
    for (const lane of board.lanes) {
      for (const label of lane.query.labelsAll ?? []) labels.add(label);
      for (const label of lane.query.labelsAny ?? []) labels.add(label);
      for (const label of lane.query.labelsNone ?? []) labels.add(label);
    }
  }

  return [...labels].sort((a, b) => a.localeCompare(b));
}
