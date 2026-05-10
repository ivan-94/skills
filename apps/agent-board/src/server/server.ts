import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultWorkflowConfig, labelsReferencedByConfig } from "./defaultConfig.ts";
import { detectGhStatus, fetchIssues, fetchPullRequests, fetchRepo, updateGithubLabels } from "./github.ts";
import { renderBoards } from "./boards.ts";
import { detectRunners } from "./runners.ts";
import { createRunArtifacts, readRunStatuses } from "./runHistory.ts";
import { detectTerminalTools, openTerminal } from "./terminal.ts";
import { log, time } from "./logger.ts";
import { requireCommand } from "./process.ts";
import {
  addWorkspace,
  loadAgentBoardConfig,
  loadWorkspaceWorkflow,
  removeWorkspace,
  saveAgentBoardConfig,
  saveWorkspaceWorkflow,
  selectWorkspace,
  setLastUsedWorkspace,
  updateWorkspace
} from "./workspaces.ts";
import { mergeWorkflowWithGlobalConfig } from "./config.ts";
import type {
  AddWorkspaceRequest,
  AgentBoardConfig,
  BoardItem,
  BoardsResponse,
  ConfigResponse,
  LabelMutationRequest,
  LabelMutationResponse,
  ProjectState,
  RunRequest,
  RunResponse,
  RunStatusResponse,
  Runner,
  UpdateWorkspaceRequest,
  WorkspaceConfig,
  WorkflowConfig
} from "../shared/types.ts";

type AppState = {
  project: ProjectState;
  config: WorkflowConfig;
  items: BoardItem[];
  workspace: WorkspaceConfig;
  appConfig: AgentBoardConfig;
};

type CachedWorkspaceState = {
  state: AppState | null;
  loadedAt: number;
  loading: Promise<AppState> | null;
};

type AppCache = {
  states: Map<string, CachedWorkspaceState>;
};

type ServerOptions = {
  cwd: string;
  port: number;
  openBrowser: boolean;
};

const appDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const clientOutDir = join(appDir, "dist", "client");
const clientEntry = join(appDir, "src", "web", "main.tsx");
const cssEntry = join(appDir, "src", "web", "styles.css");
const cssOutput = join(clientOutDir, "styles.css");
const cacheTtlMs = 5 * 60 * 1000;

export async function startServer(options: ServerOptions): Promise<{ url: string; server: Bun.Server<undefined> }> {
  log("info", "server.start", { cwd: options.cwd, preferredPort: options.port, openBrowser: options.openBrowser });
  const clientScript = await buildClient();
  const cache: AppCache = { states: new Map() };

  const server = startOnAvailablePort(options.port, createFetchHandler(options.cwd, clientScript, cache));

  const url = `http://localhost:${server.port}`;
  if (options.openBrowser) {
    log("info", "browser.open", { url });
    Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
  }

  return { url, server };
}

function startOnAvailablePort(
  preferredPort: number,
  fetch: (request: Request) => Response | Promise<Response>
): Bun.Server<undefined> {
  const maxAttempts = 20;
  let lastError: unknown = null;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = preferredPort + offset;
    try {
      const server = Bun.serve({ port, fetch });
      log("info", "server.listen", { port, preferredPort });
      return server;
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
      log("warn", "server.port_in_use", { port });
      lastError = error;
    }
  }

  throw new Error(
    `No available port found from ${preferredPort} to ${preferredPort + maxAttempts - 1}. Last error: ${messageOf(lastError)}`
  );
}

function createFetchHandler(cwd: string, clientScript: string, cache: AppCache) {
  return async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return html(clientScript);
      }

      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 204 });
      }

      if (url.pathname === "/styles.css") {
        return fileResponse(cssOutput, "text/css; charset=utf-8");
      }

      if (url.pathname.startsWith("/assets/")) {
        return fileResponse(join(clientOutDir, basename(url.pathname)), "application/javascript; charset=utf-8");
      }

      if (url.pathname === "/api/workspaces" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const appConfig = await loadAgentBoardConfig();
        return json({ appConfig, activeWorkspaceId: selectWorkspace(appConfig, readWorkspaceParam(url))?.id });
      }

      if (url.pathname === "/api/workspaces" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json()) as AddWorkspaceRequest;
        const workspace = await addWorkspace(body.path, body.name);
        clearCache(cache, workspace.id);
        const appConfig = await loadAgentBoardConfig();
        return json({ workspace, appConfig, activeWorkspaceId: workspace.id });
      }

      const workspaceRoute = matchWorkspaceRoute(url.pathname);
      if (workspaceRoute && request.method === "PATCH") {
        log("info", "http.request", { method: request.method, path: url.pathname, workspaceId: workspaceRoute.id });
        const body = (await request.json()) as UpdateWorkspaceRequest;
        const workspace = await updateWorkspace(workspaceRoute.id, body);
        const appConfig = await loadAgentBoardConfig();
        return json({ workspace, appConfig, activeWorkspaceId: appConfig.lastUsedWorkspaceId });
      }

      if (workspaceRoute && request.method === "DELETE") {
        log("info", "http.request", { method: request.method, path: url.pathname, workspaceId: workspaceRoute.id });
        await removeWorkspace(workspaceRoute.id);
        clearCache(cache, workspaceRoute.id);
        const appConfig = await loadAgentBoardConfig();
        return json({ appConfig, activeWorkspaceId: appConfig.lastUsedWorkspaceId });
      }

      if (url.pathname === "/api/project" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname, refresh: url.searchParams.get("refresh") });
        const resolved = await resolveRequestWorkspace(url);
        if (!resolved.workspace) return json(await emptyProjectState(resolved.appConfig, cwd));
        const state = await getCachedAppState(resolved.workspace, resolved.appConfig, cache, readRefreshParam(url));
        return json(state.project);
      }

      if (url.pathname === "/api/boards" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname, refresh: url.searchParams.get("refresh") });
        const resolved = await resolveRequestWorkspace(url);
        if (!resolved.workspace) {
          const project = await emptyProjectState(resolved.appConfig, cwd);
          const response: BoardsResponse = { boards: [], project };
          return json(response);
        }
        await setLastUsedWorkspace(resolved.workspace.id);
        const state = await getCachedAppState(resolved.workspace, resolved.appConfig, cache, readRefreshParam(url));
        const boards = renderBoards(state.config, state.items, state.project.repo?.labels ?? []);
        const response: BoardsResponse = { boards, project: state.project };
        return json(response);
      }

      if (url.pathname === "/api/config" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const state = await loadConfigState(url);
        return json(state);
      }

      if (url.pathname === "/api/runs" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json()) as RunRequest;
        const resolved = await resolveRequestWorkspace(url);
        if (!resolved.workspace) return json({ error: "No workspace selected." }, 400);
        const state = await getCachedAppState(resolved.workspace, resolved.appConfig, cache, "none");
        if (!state.project.githubRepoSlug) return json({ error: "No GitHub repo detected." }, 400);

        const runner = resolveRunner(state.project.runners, body);
        const run = await createRunArtifacts(state.workspace.id, body, runner);
        const opened = await openTerminal(run.scriptPath, state.config.terminal, state.project.terminalTools);
        const response: RunResponse = {
          runId: run.runId,
          scriptPath: run.scriptPath,
          recordPath: run.recordPath,
          statusPath: run.statusPath,
          opened
        };
        return json(response);
      }

      if (url.pathname === "/api/runs/status" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const resolved = await resolveRequestWorkspace(url);
        if (!resolved.workspace) return json({ error: "No workspace selected." }, 400);
        const state = await getCachedAppState(resolved.workspace, resolved.appConfig, cache, "none");
        if (!state.project.githubRepoSlug) return json({ error: "No GitHub repo detected." }, 400);
        const runIds = (url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
        const response: RunStatusResponse = {
          runs: await readRunStatuses(state.workspace.id, runIds)
        };
        return json(response);
      }

      if (url.pathname === "/api/items/labels" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json()) as LabelMutationRequest;
        const resolved = await resolveRequestWorkspace(url);
        if (!resolved.workspace) return json({ error: "No workspace selected." }, 400);
        const state = await getCachedAppState(resolved.workspace, resolved.appConfig, cache, "none");
        if (!state.project.githubRepoSlug) return json({ error: "No GitHub repo detected." }, 400);
        const label = body.label?.trim();
        if (!label) return json({ error: "Label is required." }, 400);
        if (body.itemType !== "issue" && body.itemType !== "pullRequest") return json({ error: "Invalid item type." }, 400);
        if (body.action !== "add" && body.action !== "remove") return json({ error: "Invalid label action." }, 400);

        await updateGithubLabels(state.project.githubRepoSlug, body.itemType, body.number, body.action, label);
        const item = mutateCachedItemLabel(state, body.itemType, body.number, body.action, label);
        const entry = cache.states.get(state.workspace.id);
        if (entry) {
          entry.state = state;
          entry.loadedAt = Date.now();
        }
        const boards = renderBoards(state.config, state.items, state.project.repo?.labels ?? []);
        const response: LabelMutationResponse = { item, boards, project: state.project };
        return json(response);
      }

      if (url.pathname === "/api/config/save" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json().catch(() => ({}))) as {
          config?: WorkflowConfig;
          appConfig?: AgentBoardConfig;
        };
        const state = await loadConfigState(url);
        const config = body.config ?? state.config;
        validateWorkflowConfig(config);
        const nextAppConfig = body.appConfig ?? state.appConfig;
        nextAppConfig.runners = config.runners ?? nextAppConfig.runners;
        nextAppConfig.terminal = config.terminal ?? nextAppConfig.terminal;
        const activeWorkspaceId = state.activeWorkspaceId && nextAppConfig.workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
          ? state.activeWorkspaceId
          : nextAppConfig.workspaces[0]?.id;
        nextAppConfig.lastUsedWorkspaceId = activeWorkspaceId;
        await saveAgentBoardConfig(nextAppConfig);
        if (activeWorkspaceId && activeWorkspaceId === state.activeWorkspaceId) {
          await saveWorkspaceWorkflow(activeWorkspaceId, config);
          clearCache(cache, activeWorkspaceId);
        } else {
          clearCache(cache);
        }
        return json({ saved: true, path: state.path, appConfig: nextAppConfig, activeWorkspaceId });
      }

      return json({ error: "Not found." }, 404);
    } catch (error) {
      log("error", "http.error", {
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error)
      });
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  };
}

async function loadAppState(workspace: WorkspaceConfig, appConfig: AgentBoardConfig): Promise<AppState> {
  return time("app_state.load", { workspaceId: workspace.id, gitRoot: workspace.gitRoot, repo: workspace.repoSlug }, async () => {
    const errors: string[] = [];
    let repo = null;
    let items: BoardItem[] = [];
    const loadedWorkflow = await loadWorkspaceWorkflow(workspace, appConfig);
    const config = loadedWorkflow.config;

    const ghError = await detectGhStatus();
    if (ghError) errors.push(ghError);

    if (!ghError) {
      try {
        repo = await fetchRepo(workspace.repoSlug);
      } catch (error) {
        errors.push(messageOf(error));
      }

      try {
        const [issues, prs] = await Promise.all([
          repo?.issuesEnabled === false ? Promise.resolve([]) : fetchIssues(workspace.repoSlug),
          fetchPullRequests(workspace.repoSlug)
        ]);
        items = [...issues, ...prs];
      } catch (error) {
        errors.push(messageOf(error));
      }
    }

    const [runners, terminalTools] = await Promise.all([
      detectRunners(config.runners),
      detectTerminalTools()
    ]);
    const requiredLabels = labelsReferencedByConfig(config);
    const existingLabels = new Set(repo?.labels ?? []);
    const missingLabels = requiredLabels.filter((label) => !existingLabels.has(label));

    const state = {
      config,
      items,
      workspace,
      appConfig,
      project: {
        gitRoot: workspace.gitRoot,
        repo,
        githubRepoSlug: workspace.repoSlug,
        configSource: loadedWorkflow.source,
        configPath: loadedWorkflow.path,
        missingLabels,
        runners,
        terminalTools,
        errors,
        workspace,
        workspaces: appConfig.workspaces,
        lastUsedWorkspaceId: appConfig.lastUsedWorkspaceId
      }
    };
    log("info", "app_state.loaded", {
      workspaceId: workspace.id,
      gitRoot: workspace.gitRoot,
      repo: workspace.repoSlug,
      itemCount: items.length,
      issueCount: items.filter((item) => item.itemType === "issue").length,
      prCount: items.filter((item) => item.itemType === "pullRequest").length,
      missingLabelCount: missingLabels.length,
      errorCount: errors.length
    });
    return state;
  });
}

async function getCachedAppState(
  workspace: WorkspaceConfig,
  appConfig: AgentBoardConfig,
  cache: AppCache,
  refresh: "blocking" | "stale-while-revalidate" | "none"
): Promise<AppState> {
  const entry = cache.states.get(workspace.id) ?? { state: null, loadedAt: 0, loading: null };
  cache.states.set(workspace.id, entry);
  const now = Date.now();
  const hasFreshCache = entry.state && now - entry.loadedAt < cacheTtlMs;

  if (refresh === "blocking") {
    log("info", "cache.refresh_blocking", { workspaceId: workspace.id });
    return refreshAppState(workspace, appConfig, entry);
  }

  if (entry.state && (refresh === "none" || hasFreshCache)) {
    log("info", "cache.hit", { workspaceId: workspace.id, ageMs: now - entry.loadedAt, refresh });
    return entry.state;
  }

  if (entry.state && refresh === "stale-while-revalidate") {
    log("info", "cache.stale_return", { workspaceId: workspace.id, ageMs: now - entry.loadedAt });
    void refreshAppState(workspace, appConfig, entry).catch(() => undefined);
    return entry.state;
  }

  log("info", "cache.miss", { workspaceId: workspace.id, refresh });
  return refreshAppState(workspace, appConfig, entry);
}

async function refreshAppState(
  workspace: WorkspaceConfig,
  appConfig: AgentBoardConfig,
  entry: CachedWorkspaceState
): Promise<AppState> {
  if (entry.loading) {
    log("info", "cache.loading_join", { workspaceId: workspace.id });
    return entry.loading;
  }

  log("info", "cache.refresh_start", { workspaceId: workspace.id });
  entry.loading = loadAppState(workspace, appConfig)
    .then((state) => {
      entry.state = state;
      entry.loadedAt = Date.now();
      log("info", "cache.refresh_ok", { workspaceId: workspace.id });
      return state;
    })
    .finally(() => {
      entry.loading = null;
    });

  return entry.loading;
}

function readRefreshParam(url: URL): "blocking" | "stale-while-revalidate" | "none" {
  const refresh = url.searchParams.get("refresh");
  if (refresh === "blocking" || refresh === "1" || refresh === "true") return "blocking";
  if (refresh === "stale") return "stale-while-revalidate";
  return "none";
}

function readWorkspaceParam(url: URL): string | undefined {
  const value = url.searchParams.get("workspace")?.trim();
  return value || undefined;
}

async function resolveRequestWorkspace(url: URL): Promise<{
  appConfig: AgentBoardConfig;
  workspace: WorkspaceConfig | null;
}> {
  const appConfig = await loadAgentBoardConfig();
  return {
    appConfig,
    workspace: selectWorkspace(appConfig, readWorkspaceParam(url)) ?? null
  };
}

async function emptyProjectState(appConfig: AgentBoardConfig, cwd: string): Promise<ProjectState> {
  const [runners, terminalTools] = await Promise.all([
    detectRunners(appConfig.runners),
    detectTerminalTools()
  ]);

  return {
    gitRoot: cwd,
    repo: null,
    githubRepoSlug: null,
    configSource: "default",
    configPath: "~/.agent-board/config.yml",
    missingLabels: [],
    runners,
    terminalTools,
    errors: [],
    workspace: null,
    workspaces: appConfig.workspaces,
    lastUsedWorkspaceId: appConfig.lastUsedWorkspaceId
  };
}

function matchWorkspaceRoute(pathname: string): { id: string } | null {
  const match = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  return match ? { id: decodeURIComponent(match[1]) } : null;
}

function clearCache(cache: AppCache, workspaceId?: string): void {
  if (workspaceId) cache.states.delete(workspaceId);
  else cache.states.clear();
}

async function loadConfigState(url: URL): Promise<ConfigResponse> {
  return time("config.load", { workspace: readWorkspaceParam(url) }, async () => {
    const appConfig = await loadAgentBoardConfig();
    const workspace = selectWorkspace(appConfig, readWorkspaceParam(url));
    if (!workspace) {
      const config = mergeWorkflowWithGlobalConfig(defaultWorkflowConfig, appConfig);
      return {
        config,
        source: "default",
        path: "~/.agent-board/config.yml",
        appConfig
      };
    }

    const loadedConfig = await loadWorkspaceWorkflow(workspace, appConfig);
    log("info", "config.loaded", {
      workspaceId: workspace.id,
      source: loadedConfig.source,
      path: loadedConfig.path,
      boardCount: loadedConfig.config.boards.length
    });
    return {
      config: loadedConfig.config,
      source: loadedConfig.source,
      path: loadedConfig.path,
      appConfig,
      activeWorkspaceId: workspace.id
    };
  });
}

function resolveRunner(runners: Runner[], request: RunRequest): Runner {
  const runner = runners.find((candidate) => candidate.id === request.runnerId);
  if (!runner) throw new Error(`Runner not found: ${request.runnerId}`);
  if (!runner.detected) throw new Error(`${runner.label} was not detected on this machine.`);
  log("info", "runner.resolve", { runnerId: runner.id, command: runner.command });
  return runner;
}

function mutateCachedItemLabel(
  state: AppState,
  itemType: "issue" | "pullRequest",
  number: number,
  action: "add" | "remove",
  label: string
): BoardItem {
  const item = state.items.find((candidate) => candidate.itemType === itemType && candidate.number === number);
  if (!item) throw new Error(`${itemType} #${number} was not found in the local cache.`);

  const labels = new Set(item.labels);
  if (action === "add") labels.add(label);
  else labels.delete(label);

  item.labels = [...labels].sort((a, b) => a.localeCompare(b));

  if (action === "add" && state.project.repo && !state.project.repo.labels.includes(label)) {
    state.project.repo.labels = [...state.project.repo.labels, label].sort((a, b) => a.localeCompare(b));
    const existingLabels = new Set(state.project.repo.labels);
    state.project.missingLabels = labelsReferencedByConfig(state.config).filter((candidate) => !existingLabels.has(candidate));
  }

  log("info", "cache.item_label_mutated", {
    itemType,
    number,
    action,
    label,
    labelCount: item.labels.length
  });

  return item;
}

async function buildClient(): Promise<string> {
  return time("client.build", { entry: clientEntry, outdir: clientOutDir }, async () => {
    await mkdir(clientOutDir, { recursive: true });
    await buildStyles();
    const output = await Bun.build({
      entrypoints: [clientEntry],
      outdir: clientOutDir,
      target: "browser",
      splitting: false,
      sourcemap: "external",
      minify: false
    });

    if (!output.success) {
      const messages = output.logs.map((log) => log.message).join("\n");
      throw new Error(`Client build failed:\n${messages}`);
    }

    const outputFile = output.outputs.find((file) => file.path.endsWith(".js"));
    if (!outputFile) throw new Error("Client build did not produce a JavaScript bundle.");
    return `/assets/${basename(outputFile.path)}`;
  });
}

async function buildStyles(): Promise<void> {
  await time("styles.build", { entry: cssEntry, output: cssOutput }, async () => {
    await requireCommand([
      join(appDir, "node_modules", ".bin", "tailwindcss"),
      "-i",
      cssEntry,
      "-o",
      cssOutput
    ]);
  });
}

function html(clientScript: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Board</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${clientScript}"></script>
  </body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

async function fileResponse(path: string, contentType: string): Promise<Response> {
  if (!existsSync(path)) return json({ error: "File not found." }, 404);
  return new Response(await readFile(path), {
    headers: { "content-type": contentType }
  });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAddressInUse(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  return maybeError.code === "EADDRINUSE" || String(maybeError.message ?? "").includes("EADDRINUSE");
}

function validateWorkflowConfig(config: WorkflowConfig): void {
  if (!config || config.version !== 1 || !Array.isArray(config.boards)) {
    throw new Error("Config must contain version: 1 and boards: [].");
  }

  const ids = new Set<string>();
  for (const board of config.boards) {
    if (!board.id || !board.title || !board.itemType) {
      throw new Error("Every board requires id, title, and itemType.");
    }
    if (ids.has(`board:${board.id}`)) throw new Error(`Duplicate board id: ${board.id}`);
    ids.add(`board:${board.id}`);

    for (const lane of board.lanes) {
      if (!lane.id || !lane.title) throw new Error(`Every lane in ${board.id} requires id and title.`);
      const laneKey = `lane:${board.id}:${lane.id}`;
      if (ids.has(laneKey)) throw new Error(`Duplicate lane id in ${board.id}: ${lane.id}`);
      ids.add(laneKey);

      for (const action of lane.actions) {
        if (!action.id || !action.title || !action.promptTemplate) {
          throw new Error(`Every action in ${board.id}/${lane.id} requires id, title, and promptTemplate.`);
        }
      }
    }
  }

  for (const runner of config.runners ?? []) {
    if (!runner.id || !runner.label || !runner.command || !Array.isArray(runner.args)) {
      throw new Error("Every runner requires id, label, command, and args.");
    }
    const runnerKey = `runner:${runner.id}`;
    if (ids.has(runnerKey)) throw new Error(`Duplicate runner id: ${runner.id}`);
    ids.add(runnerKey);

    for (const mode of runner.permissionModes ?? []) {
      if (!mode.id || !mode.label || !Array.isArray(mode.args)) {
        throw new Error(`Every permission mode in runner ${runner.id} requires id, label, and args.`);
      }
      const modeKey = `runner:${runner.id}:mode:${mode.id}`;
      if (ids.has(modeKey)) throw new Error(`Duplicate permission mode id in ${runner.id}: ${mode.id}`);
      ids.add(modeKey);
    }
  }

  if (config.terminal) {
    if (!config.terminal.id || !["window", "tab"].includes(config.terminal.openMode)) {
      throw new Error("Terminal config requires id and openMode: window | tab.");
    }
  }
}
