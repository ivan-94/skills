import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultWorkflowConfig, labelsReferencedByConfig } from "./defaultConfig.ts";
import { loadWorkflowConfig, serializeWorkflowConfig } from "./config.ts";
import { findFirstGithubRemote, findGitRoot } from "./git.ts";
import { detectGhStatus, fetchIssues, fetchPullRequests, fetchRepo, updateGithubLabels } from "./github.ts";
import { renderBoards } from "./boards.ts";
import { detectRunners } from "./runners.ts";
import { createRunArtifacts, readRunStatuses } from "./runHistory.ts";
import { detectTerminalTools, openTerminal } from "./terminal.ts";
import { log, time } from "./logger.ts";
import { requireCommand } from "./process.ts";
import type {
  BoardItem,
  BoardsResponse,
  LabelMutationRequest,
  LabelMutationResponse,
  ProjectState,
  RunRequest,
  RunResponse,
  RunStatusResponse,
  Runner,
  WorkflowConfig
} from "../shared/types.ts";

type AppState = {
  project: ProjectState;
  config: WorkflowConfig;
  items: BoardItem[];
};

type AppCache = {
  state: AppState | null;
  loadedAt: number;
  loading: Promise<AppState> | null;
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
  const cache: AppCache = { state: null, loadedAt: 0, loading: null };

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

      if (url.pathname === "/api/project" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname, refresh: url.searchParams.get("refresh") });
        const state = await getCachedAppState(cwd, cache, readRefreshParam(url));
        return json(state.project);
      }

      if (url.pathname === "/api/boards" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname, refresh: url.searchParams.get("refresh") });
        const state = await getCachedAppState(cwd, cache, readRefreshParam(url));
        const boards = renderBoards(state.config, state.items, state.project.repo?.labels ?? []);
        const response: BoardsResponse = { boards, project: state.project };
        return json(response);
      }

      if (url.pathname === "/api/config" && request.method === "GET") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const state = await loadConfigState(cwd);
        return json({
          config: state.config,
          source: state.source,
          path: state.path
        });
      }

      if (url.pathname === "/api/runs" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json()) as RunRequest;
        const state = await getCachedAppState(cwd, cache, "none");
        if (!state.project.githubRepoSlug) return json({ error: "No GitHub repo detected." }, 400);

        const runner = resolveRunner(state.project.runners, body);
        const run = await createRunArtifacts(state.project.githubRepoSlug, body, runner);
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
        const state = await getCachedAppState(cwd, cache, "none");
        if (!state.project.githubRepoSlug) return json({ error: "No GitHub repo detected." }, 400);
        const runIds = (url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
        const response: RunStatusResponse = {
          runs: await readRunStatuses(state.project.githubRepoSlug, runIds)
        };
        return json(response);
      }

      if (url.pathname === "/api/items/labels" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json()) as LabelMutationRequest;
        const state = await getCachedAppState(cwd, cache, "none");
        if (!state.project.githubRepoSlug) return json({ error: "No GitHub repo detected." }, 400);
        const label = body.label?.trim();
        if (!label) return json({ error: "Label is required." }, 400);
        if (body.itemType !== "issue" && body.itemType !== "pullRequest") return json({ error: "Invalid item type." }, 400);
        if (body.action !== "add" && body.action !== "remove") return json({ error: "Invalid label action." }, 400);

        await updateGithubLabels(state.project.githubRepoSlug, body.itemType, body.number, body.action, label);
        const item = mutateCachedItemLabel(state, body.itemType, body.number, body.action, label);
        cache.state = state;
        cache.loadedAt = Date.now();
        const boards = renderBoards(state.config, state.items, state.project.repo?.labels ?? []);
        const response: LabelMutationResponse = { item, boards, project: state.project };
        return json(response);
      }

      if (url.pathname === "/api/config/save" && request.method === "POST") {
        log("info", "http.request", { method: request.method, path: url.pathname });
        const body = (await request.json().catch(() => ({}))) as {
          config?: WorkflowConfig;
          overwrite?: boolean;
        };
        const state = await loadConfigState(cwd);
        const config = body.config ?? state.config;
        validateWorkflowConfig(config);
        if (existsSync(state.path) && !body.overwrite) {
          return json({ error: ".agent-board.yml already exists." }, 409);
        }
        await time("config.save", { path: state.path, overwrite: body.overwrite === true }, () =>
          writeFile(state.path, serializeWorkflowConfig(config))
        );
        cache.state = null;
        cache.loadedAt = 0;
        return json({ saved: true, path: state.path });
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

async function loadAppState(cwd: string): Promise<AppState> {
  return time("app_state.load", { cwd }, async () => {
    const errors: string[] = [];
    let gitRoot = cwd;
    let githubRepoSlug: string | null = null;
    let repo = null;
    let config = defaultWorkflowConfig;
    let configSource: "default" | "project" = "default";
    let configPath = join(cwd, ".agent-board.yml");
    let items: BoardItem[] = [];

    try {
      gitRoot = await findGitRoot(cwd);
    } catch (error) {
      errors.push(messageOf(error));
    }

    try {
      const loadedConfig = await loadWorkflowConfig(gitRoot);
      config = loadedConfig.config;
      configSource = loadedConfig.source;
      configPath = loadedConfig.path;
    } catch (error) {
      errors.push(messageOf(error));
    }

    try {
      const remote = await findFirstGithubRemote(gitRoot);
      githubRepoSlug = remote.slug;
    } catch (error) {
      errors.push(messageOf(error));
    }

    const ghError = await detectGhStatus();
    if (ghError) errors.push(ghError);

    if (githubRepoSlug && !ghError) {
      try {
        repo = await fetchRepo(githubRepoSlug);
      } catch (error) {
        errors.push(messageOf(error));
      }

      try {
        const [issues, prs] = await Promise.all([
          repo?.issuesEnabled === false ? Promise.resolve([]) : fetchIssues(githubRepoSlug),
          fetchPullRequests(githubRepoSlug)
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
      project: {
        gitRoot,
        repo,
        githubRepoSlug,
        configSource,
        configPath,
        missingLabels,
        runners,
        terminalTools,
        errors
      }
    };
    log("info", "app_state.loaded", {
      gitRoot,
      repo: githubRepoSlug,
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
  cwd: string,
  cache: AppCache,
  refresh: "blocking" | "stale-while-revalidate" | "none"
): Promise<AppState> {
  const now = Date.now();
  const hasFreshCache = cache.state && now - cache.loadedAt < cacheTtlMs;

  if (refresh === "blocking") {
    log("info", "cache.refresh_blocking", { cwd });
    return refreshAppState(cwd, cache);
  }

  if (cache.state && (refresh === "none" || hasFreshCache)) {
    log("info", "cache.hit", { cwd, ageMs: now - cache.loadedAt, refresh });
    return cache.state;
  }

  if (cache.state && refresh === "stale-while-revalidate") {
    log("info", "cache.stale_return", { cwd, ageMs: now - cache.loadedAt });
    void refreshAppState(cwd, cache).catch(() => undefined);
    return cache.state;
  }

  log("info", "cache.miss", { cwd, refresh });
  return refreshAppState(cwd, cache);
}

async function refreshAppState(cwd: string, cache: AppCache): Promise<AppState> {
  if (cache.loading) {
    log("info", "cache.loading_join", { cwd });
    return cache.loading;
  }

  log("info", "cache.refresh_start", { cwd });
  cache.loading = loadAppState(cwd)
    .then((state) => {
      cache.state = state;
      cache.loadedAt = Date.now();
      log("info", "cache.refresh_ok", { cwd });
      return state;
    })
    .finally(() => {
      cache.loading = null;
    });

  return cache.loading;
}

function readRefreshParam(url: URL): "blocking" | "stale-while-revalidate" | "none" {
  const refresh = url.searchParams.get("refresh");
  if (refresh === "blocking" || refresh === "1" || refresh === "true") return "blocking";
  if (refresh === "stale") return "stale-while-revalidate";
  return "none";
}

async function loadConfigState(cwd: string): Promise<{
  config: WorkflowConfig;
  source: "default" | "project";
  path: string;
}> {
  return time("config.load", { cwd }, async () => {
    let gitRoot = cwd;

    try {
      gitRoot = await findGitRoot(cwd);
    } catch {
      // Keep config editing available enough to show the default config even
      // when the current directory is not a git repository.
    }

    const loadedConfig = await loadWorkflowConfig(gitRoot);
    log("info", "config.loaded", {
      gitRoot,
      source: loadedConfig.source,
      path: loadedConfig.path,
      boardCount: loadedConfig.config.boards.length
    });
    return {
      config: loadedConfig.config,
      source: loadedConfig.source,
      path: loadedConfig.path
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
