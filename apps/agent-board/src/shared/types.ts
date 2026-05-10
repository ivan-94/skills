export type ItemType = "issue" | "pullRequest";

export type WorkflowConfig = {
  version: 1;
  runners?: RunnerConfig[];
  terminal?: TerminalConfig;
  boards: BoardConfig[];
};

export type AgentBoardConfig = {
  version: 1;
  lastUsedWorkspaceId?: string;
  runners: RunnerConfig[];
  terminal: TerminalConfig;
  workspaces: WorkspaceConfig[];
};

export type WorkspaceConfig = {
  id: string;
  name: string;
  gitRoot: string;
  repoSlug: string;
  repoUrl: string;
};

export type AddWorkspaceRequest = {
  path: string;
  name?: string;
};

export type UpdateWorkspaceRequest = {
  name?: string;
};

export type TerminalOpenMode = "window" | "tab";

export type TerminalConfig = {
  id: string;
  openMode: TerminalOpenMode;
};

export type TerminalTool = {
  id: string;
  label: string;
  appName: string;
  detected: boolean;
  supportsTabs: boolean;
};

export type RunnerConfig = {
  id: string;
  label: string;
  command: string;
  args: string[];
  permissionModes?: RunnerPermissionMode[];
  defaultPermissionMode?: string;
};

export type RunnerPermissionMode = {
  id: string;
  label: string;
  args: string[];
  description?: string;
};

export type BoardConfig = {
  id: string;
  title: string;
  itemType: ItemType;
  lanes: LaneConfig[];
};

export type LaneConfig = {
  id: string;
  title: string;
  query: LaneQuery;
  actions: ActionConfig[];
};

export type LaneQuery = {
  labelsAll?: string[];
  labelsAny?: string[];
  labelsNone?: string[];
  includeUnlabeled?: boolean;
  noAssignee?: boolean;
  isDraft?: boolean;
  reviewDecisionAny?: string[];
};

export type ActionConfig = {
  id: string;
  title: string;
  promptTemplate: string;
  runner?: string;
  confirmBeforeRun?: boolean;
};

export type GithubRepo = {
  nameWithOwner: string;
  url: string;
  defaultBranch: string;
  viewerPermission: string;
  issuesEnabled: boolean | null;
  labels: string[];
};

export type GithubIssue = {
  itemType: "issue";
  id: string;
  number: number;
  ref: string;
  title: string;
  url: string;
  state: string;
  labels: string[];
  assignees: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
};

export type GithubPullRequest = {
  itemType: "pullRequest";
  id: string;
  number: number;
  ref: string;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  labels: string[];
  author: string;
  headRefName: string;
  baseRefName: string;
  reviewDecision: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoardItem = GithubIssue | GithubPullRequest;

export type RenderedLane = LaneConfig & {
  items: BoardItem[];
  missingLabels: string[];
};

export type RenderedBoard = Omit<BoardConfig, "lanes"> & {
  lanes: RenderedLane[];
};

export type Runner = {
  id: string;
  label: string;
  command: string;
  args: string[];
  permissionModes?: RunnerPermissionMode[];
  defaultPermissionMode?: string;
  detected: boolean;
};

export type ProjectState = {
  workspace: WorkspaceConfig | null;
  workspaces: WorkspaceConfig[];
  lastUsedWorkspaceId?: string;
  gitRoot: string;
  repo: GithubRepo | null;
  githubRepoSlug: string | null;
  configSource: "default" | "workspace";
  configPath: string;
  missingLabels: string[];
  runners: Runner[];
  terminalTools: TerminalTool[];
  errors: string[];
};

export type BoardsResponse = {
  boards: RenderedBoard[];
  project: ProjectState;
};

export type ConfigResponse = {
  config: WorkflowConfig;
  source: "default" | "workspace";
  path: string;
  appConfig: AgentBoardConfig;
  activeWorkspaceId?: string;
};

export type RenderActionRequest = {
  boardId: string;
  laneId: string;
  actionId: string;
  selectedIds: string[];
};

export type RenderActionResponse = {
  action: ActionConfig;
  selectedRefs: string[];
  selectedItems: BoardItem[];
  prompt: string;
  cwd: string;
  defaultRunnerId: string;
};

export type RunRequest = {
  boardId: string;
  laneId: string;
  actionId: string;
  actionTitle: string;
  selectedItems: BoardItem[];
  selectedRefs: string[];
  runnerId: string;
  permissionModeId?: string;
  prompt: string;
  cwd: string;
};

export type RunResponse = {
  runId: string;
  scriptPath: string;
  recordPath: string;
  statusPath: string;
  opened: boolean;
};

export type RunStatus = {
  runId: string;
  status: "pending" | "running" | "exited" | "unknown";
  pid?: number;
  exitCode?: number;
  startedAt?: string;
  updatedAt?: string;
  endedAt?: string;
};

export type RunStatusResponse = {
  runs: RunStatus[];
};

export type LabelMutationRequest = {
  itemType: ItemType;
  number: number;
  action: "add" | "remove";
  label: string;
};

export type LabelMutationResponse = BoardsResponse & {
  item: BoardItem;
};
