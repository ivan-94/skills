import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast as sonnerToast } from "sonner";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Monitor,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  SquareTerminal,
  Sun,
  Trash2,
  X
} from "lucide-react";
import type {
  ActionConfig,
  AgentBoardConfig,
  BoardConfig,
  BoardItem,
  BoardsResponse,
  ConfigResponse,
  LabelMutationResponse,
  LaneConfig,
  LaneQuery,
  RunnerConfig,
  RenderedBoard,
  RenderedLane,
  Runner,
  RunStatusResponse,
  RunnerPermissionMode,
  TerminalConfig,
  TerminalTool,
  WorkspaceConfig,
  WorkflowConfig
} from "../shared/types.ts";
import {
  Badge,
  AnchorButton,
  Button,
  Card,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Textarea
} from "./components/ui.tsx";

type Selection = {
  boardId: string;
  laneId: string;
  selectedIds: string[];
};

type RunDialogState = {
  boardId: string;
  laneId: string;
  action: ActionConfig;
  prompt: string;
  selectedRefs: string[];
  selectedItems: BoardItem[];
  cwd: string;
  runnerId: string;
};

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
type ItemRunState = {
  runIds: string[];
  status: "starting" | "running";
};
type AppMessage = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "danger" | "info";
  createdAt: string;
};

function App() {
  const [data, setData] = useState<BoardsResponse | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => new URLSearchParams(window.location.search).get("workspace") ?? "");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string>("issues");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dialog, setDialog] = useState<RunDialogState | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<WorkflowConfig | null>(null);
  const [appConfigDraft, setAppConfigDraft] = useState<AgentBoardConfig | null>(null);
  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false);
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [reportedSetupSignature, setReportedSetupSignature] = useState("");
  const [itemRuns, setItemRuns] = useState<Record<string, ItemRunState>>({});
  const [labelBusy, setLabelBusy] = useState<Record<string, boolean>>({});
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem("agent-board-theme-preference");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    syncSystemTheme();
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    localStorage.setItem("agent-board-theme-preference", themePreference);
  }, [resolvedTheme, themePreference]);

  async function refresh(mode: "initial" | "background" = data ? "background" : "initial") {
    if (mode === "initial") setInitialLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch(apiPath("/api/boards", {
        workspace: activeWorkspaceId,
        refresh: mode === "background" ? "blocking" : undefined
      }));
      const body = (await response.json()) as BoardsResponse | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Load failed");
      setData(body);
      const resolvedWorkspaceId = body.project.workspace?.id ?? "";
      if (resolvedWorkspaceId && resolvedWorkspaceId !== activeWorkspaceId) {
        setActiveWorkspaceId(resolvedWorkspaceId);
        updateWorkspaceUrl(resolvedWorkspaceId);
      }
      setActiveBoardId((current) => body.boards.some((board) => board.id === current) ? current : body.boards[0]?.id ?? "issues");
    } catch (caught) {
      reportMessage("Refresh failed", caught instanceof Error ? caught.message : String(caught), "danger");
    } finally {
      if (mode === "initial") setInitialLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh("initial");
  }, []);

  useEffect(() => {
    if (!data) return;
    setSelection(null);
    setItemRuns({});
    void refresh("initial");
  }, [activeWorkspaceId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh("background");
    }, 5 * 60 * 1000);

    return () => window.clearInterval(id);
  }, [data]);

  useEffect(() => {
    const signature = data?.project.errors.join("\n") ?? "";
    if (!signature || signature === reportedSetupSignature) return;
    setReportedSetupSignature(signature);
    reportMessage("Setup issues", signature, "danger");
  }, [data?.project.errors, reportedSetupSignature]);

  function reportMessage(title: string, message: string, tone: AppMessage["tone"] = "info") {
    const next = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      message,
      tone,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [next, ...current].slice(0, 100));
    const notify = tone === "success" ? sonnerToast.success : tone === "danger" ? sonnerToast.error : sonnerToast;
    notify(title, { description: message });
  }

  function clearMessage(id: string) {
    setMessages((current) => current.filter((message) => message.id !== id));
  }

  const activeBoard = data?.boards.find((board) => board.id === activeBoardId) ?? data?.boards[0] ?? null;
  const activeRunIds = useMemo(
    () => [...new Set(Object.values(itemRuns).flatMap((run) => run.runIds))],
    [itemRuns]
  );

  useEffect(() => {
    if (!activeRunIds.length) return;
    const poll = async () => {
      const response = await fetch(apiPath("/api/runs/status", {
        workspace: activeWorkspaceId,
        ids: activeRunIds.join(",")
      }));
      const body = (await response.json()) as RunStatusResponse | { error: string };
      if (!response.ok || "error" in body) return;
      const finished = new Set(
        body.runs
          .filter((run) => run.status === "exited")
          .map((run) => run.runId)
      );
      if (!finished.size) return;
      setItemRuns((current) => pruneFinishedRuns(current, finished));
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2500);
    return () => window.clearInterval(id);
  }, [activeRunIds.join(",")]);

  function toggleItem(boardId: string, laneId: string, itemId: string) {
    setSelection((current) => {
      if (!current || current.boardId !== boardId || current.laneId !== laneId) {
        return { boardId, laneId, selectedIds: [itemId] };
      }

      const selected = new Set(current.selectedIds);
      if (selected.has(itemId)) selected.delete(itemId);
      else selected.add(itemId);

      return selected.size ? { ...current, selectedIds: [...selected] } : null;
    });
  }

  function openAction(board: RenderedBoard, lane: RenderedLane, action: ActionConfig) {
    if (!selection?.selectedIds.length) return;
    const selectedIdSet = new Set(selection.selectedIds);
    const selectedItems = lane.items.filter((item) => selectedIdSet.has(item.id));

    setDialog({
      boardId: board.id,
      laneId: lane.id,
      action,
      prompt: renderPromptTemplate(action.promptTemplate, selectedItems),
      selectedRefs: selectedItems.map((item) => item.ref),
      selectedItems,
      cwd: data?.project.gitRoot ?? "",
      runnerId: action.runner ?? chooseDefaultRunner(data?.project.runners ?? [])
    });
  }

  async function runAction(payload: {
    runnerId: string;
    permissionModeId: string;
    prompt: string;
    splitRuns: boolean;
    splitRunPrompts: Array<{ itemId: string; prompt: string }>;
  }) {
    if (!dialog) return;
    const runPayloads = payload.splitRuns
      ? payload.splitRunPrompts.map((splitPrompt) => {
          const item = dialog.selectedItems.find((candidate) => candidate.id === splitPrompt.itemId);
          if (!item) return null;
          return {
            selectedItems: [item],
            selectedRefs: [item.ref],
            prompt: splitPrompt.prompt
          };
        }).filter((runPayload): runPayload is { selectedItems: BoardItem[]; selectedRefs: string[]; prompt: string } => runPayload !== null)
      : [{
          selectedItems: dialog.selectedItems,
          selectedRefs: dialog.selectedRefs,
          prompt: payload.prompt
        }];
    const runRequests = runPayloads.map((runPayload) => ({
      itemIds: runPayload.selectedItems.map((item) => item.id),
      request: {
        boardId: dialog.boardId,
        laneId: dialog.laneId,
        actionId: dialog.action.id,
        actionTitle: dialog.action.title,
        selectedItems: runPayload.selectedItems,
        selectedRefs: runPayload.selectedRefs,
        runnerId: payload.runnerId,
        permissionModeId: payload.permissionModeId,
        prompt: runPayload.prompt,
        cwd: dialog.cwd
      }
    }));

    markItemsStarting(runRequests.flatMap((run) => run.itemIds));

    const runs = await Promise.all(runRequests.map(async (run) => ({
      itemIds: run.itemIds,
      result: await startRun(run.request)
    })));

    const failed = runs.find((run) => run.result.error);
    if (failed) {
      clearItemRuns(runRequests.flatMap((run) => run.itemIds));
      reportMessage("Run failed", failed.result.error ?? "Failed to start run.", "danger");
      return;
    }

    markItemsRunning(runs.map((run) => ({
      itemIds: run.itemIds,
      runId: run.result.runId ?? ""
    })).filter((run) => run.runId));
    const successfulRuns = runs.map((run) => run.result) as Array<{ runId: string; scriptPath: string }>;
    reportMessage(
      payload.splitRuns ? "Runs started" : "Run started",
      successfulRuns.map((run) => `${run.runId}\n${run.scriptPath}`).join("\n\n"),
      "success"
    );
    setDialog(null);
  }

  async function startRun(request: {
    boardId: string;
    laneId: string;
    actionId: string;
    actionTitle: string;
    selectedItems: BoardItem[];
    selectedRefs: string[];
    runnerId: string;
    permissionModeId: string;
    prompt: string;
    cwd: string;
  }): Promise<{ runId?: string; scriptPath?: string; error?: string }> {
    const response = await fetch(apiPath("/api/runs", { workspace: activeWorkspaceId }), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    const body = (await response.json()) as { runId: string; scriptPath: string; error?: string };
    if (!response.ok || "error" in body) {
      return { error: body.error ?? "Failed to start run." };
    }
    return body;
  }

  function markItemsStarting(itemIds: string[]) {
    setItemRuns((current) => {
      const next = { ...current };
      for (const itemId of itemIds) {
        next[itemId] = { runIds: next[itemId]?.runIds ?? [], status: "starting" };
      }
      return next;
    });
  }

  function markItemsRunning(runs: Array<{ itemIds: string[]; runId: string }>) {
    setItemRuns((current) => {
      const next = { ...current };
      for (const run of runs) {
        for (const itemId of run.itemIds) {
          const existing = next[itemId]?.runIds ?? [];
          next[itemId] = { runIds: [...new Set([...existing, run.runId])], status: "running" };
        }
      }
      return next;
    });
  }

  function clearItemRuns(itemIds: string[]) {
    setItemRuns((current) => {
      const next = { ...current };
      for (const itemId of itemIds) delete next[itemId];
      return next;
    });
  }

  async function mutateLabel(item: BoardItem, action: "add" | "remove", label: string) {
    const normalizedLabel = label.trim();
    if (!data || !normalizedLabel) return;
    const busyKey = `${item.id}:${action}:${normalizedLabel}`;
    setLabelBusy((current) => ({ ...current, [busyKey]: true }));
    try {
      const response = await fetch(apiPath("/api/items/labels", { workspace: activeWorkspaceId }), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemType: item.itemType,
          number: item.number,
          action,
          label: normalizedLabel
        })
      });
      const body = (await response.json()) as LabelMutationResponse | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Failed to update label.");
      setData({ boards: body.boards, project: body.project });
      reportMessage(action === "add" ? "Label added" : "Label removed", `${item.ref} ${normalizedLabel}`, "success");
    } catch (caught) {
      reportMessage("Label update failed", caught instanceof Error ? caught.message : String(caught), "danger");
    } finally {
      setLabelBusy((current) => {
        const next = { ...current };
        delete next[busyKey];
        return next;
      });
    }
  }

  async function openConfigDialog() {
    const response = await fetch(apiPath("/api/config", { workspace: activeWorkspaceId }));
    const body = (await response.json()) as ConfigResponse | { error: string };
    if (!response.ok || "error" in body) {
      reportMessage("Config load failed", "error" in body ? body.error : "Failed to load config.", "danger");
      return;
    }
    setConfigDraft(cloneConfig(body.config));
    setAppConfigDraft(cloneAppConfig(body.appConfig));
    if (body.activeWorkspaceId && body.activeWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(body.activeWorkspaceId);
      updateWorkspaceUrl(body.activeWorkspaceId);
    }
    setConfigDialogOpen(true);
  }

  async function saveConfig(config: WorkflowConfig, appConfig: AgentBoardConfig) {
    const response = await fetch(apiPath("/api/config/save", { workspace: activeWorkspaceId }), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config, appConfig })
    });
    const body = (await response.json()) as { saved?: boolean; path?: string; appConfig?: AgentBoardConfig; activeWorkspaceId?: string; error?: string };
    if (!response.ok || body.error) {
      reportMessage("Config save failed", body.error ?? "Failed to save config.", "danger");
      return;
    }
    const workspaceChanged = Boolean(body.activeWorkspaceId && body.activeWorkspaceId !== activeWorkspaceId);
    if (body.activeWorkspaceId) {
      setActiveWorkspaceId(body.activeWorkspaceId);
      updateWorkspaceUrl(body.activeWorkspaceId);
    }
    reportMessage("Config saved", `Saved ${body.path}`, "success");
    setConfigDialogOpen(false);
    if (!workspaceChanged) await refresh("background");
  }

  async function addWorkspace(path: string, name?: string) {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, name })
    });
    const body = (await response.json()) as { workspace?: WorkspaceConfig; activeWorkspaceId?: string; appConfig?: AgentBoardConfig; error?: string };
    if (!response.ok || body.error || !body.workspace) {
      reportMessage("Workspace add failed", body.error ?? "Failed to add workspace.", "danger");
      return false;
    }
    setActiveWorkspaceId(body.workspace.id);
    updateWorkspaceUrl(body.workspace.id);
    setAddWorkspaceOpen(false);
    reportMessage("Workspace added", `${body.workspace.name} · ${body.workspace.repoSlug}`, "success");
    return true;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbarMain">
          <div className="brandRow">
            <div className="brand">Agent Board</div>
            <Badge variant={data?.project.configSource === "workspace" ? "default" : "outline"}>
              {data?.project.configSource === "workspace" ? "Workspace" : "Default"}
            </Badge>
          </div>
          <div className="meta truncate">
            {data?.project.githubRepoSlug ?? "No GitHub repo"} · {data?.project.gitRoot ?? "Loading git root"}
          </div>
        </div>
        <div className="topbarActions">
          <WorkspaceMenu
            workspaces={data?.project.workspaces ?? []}
            activeWorkspaceId={data?.project.workspace?.id ?? activeWorkspaceId}
            onSelect={(workspaceId) => {
              setActiveWorkspaceId(workspaceId);
              updateWorkspaceUrl(workspaceId);
            }}
            onAdd={() => setAddWorkspaceOpen(true)}
          />
          {data?.project.missingLabels.length ? <MissingLabelsMenu labels={data.project.missingLabels} /> : null}
          <InboxMenu
            messages={messages}
            onDelete={clearMessage}
            onClear={() => setMessages([])}
          />
          <Badge variant="secondary">Runners {detectedRunnerCount(data?.project.runners ?? [])}/{data?.project.runners.length ?? 0}</Badge>
          {data?.project.repo?.url ? (
            <AnchorButton href={data.project.repo.url} target="_blank" rel="noreferrer" variant="outline" size="sm">
              <GithubMark />
              GitHub
            </AnchorButton>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <GithubMark />
              GitHub
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setThemePreference(nextThemePreference(themePreference))}>
            {themePreference === "system" ? <Monitor size={15} /> : resolvedTheme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            {themePreference === "system" ? "System" : themePreference === "dark" ? "Dark" : "Light"}
          </Button>
          <Button variant="outline" size="sm" onClick={openConfigDialog}>
            <Settings size={15} />
            Configure
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh("background")} disabled={refreshing}>
            <RefreshCw className={refreshing ? "spin" : ""} size={15} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </header>

      <main className="boardShell">
        {!initialLoading && !data?.project.workspace ? (
          <EmptyWorkspaceState onAdd={addWorkspace} />
        ) : (
        <>
        <Card className="boardToolbar">
          <nav className="tabs">
            {data?.boards.map((board) => (
              <Button
                key={board.id}
                variant={board.id === activeBoard?.id ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setActiveBoardId(board.id);
                  setSelection(null);
                }}
              >
                {board.title}
              </Button>
            ))}
          </nav>
          <div className="meta">{activeBoard ? `${activeBoard.lanes.length} lanes` : "No board"}</div>
        </Card>

        {initialLoading ? <Card className="stateBox">Loading board...</Card> : null}
        {!initialLoading && activeBoard ? (
          <BoardView
            board={activeBoard}
            selection={selection}
            issuesDisabled={activeBoard.itemType === "issue" && data?.project.repo?.issuesEnabled === false}
            availableLabels={data?.project.repo?.labels ?? []}
            itemRuns={itemRuns}
            labelBusy={labelBusy}
            onToggle={toggleItem}
            onAction={openAction}
            onAddLabel={(item, label) => void mutateLabel(item, "add", label)}
            onRemoveLabel={(item, label) => void mutateLabel(item, "remove", label)}
          />
        ) : null}
        </>
        )}
      </main>

      {dialog && data ? (
        <RunDialog
          dialog={dialog}
          runners={data.project.runners}
          onCancel={() => setDialog(null)}
          onRun={runAction}
        />
      ) : null}

      {configDraft ? (
        <ConfigDialog
          open={configDialogOpen}
          config={configDraft}
          appConfig={appConfigDraft}
          terminalTools={data?.project.terminalTools ?? []}
          onChange={setConfigDraft}
          onAppConfigChange={setAppConfigDraft}
          onAddWorkspace={() => {
            setConfigDialogOpen(false);
            setAddWorkspaceOpen(true);
          }}
          onCancel={() => setConfigDialogOpen(false)}
          onSave={saveConfig}
        />
      ) : null}

      {addWorkspaceOpen ? (
        <AddWorkspaceDialog
          onCancel={() => setAddWorkspaceOpen(false)}
          onAdd={addWorkspace}
        />
      ) : null}

      <Toaster richColors closeButton position="bottom-right" />
    </div>
  );
}

function MissingLabelsMenu(props: { labels: string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Missing labels" className="text-amber-500">
          <AlertTriangle size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-80 gap-1.5">
        <div className="popoverTitle">Missing labels</div>
        <div className="popoverText">{props.labels.join(", ")}</div>
        <div className="popoverHint">Label creation is not automatic.</div>
      </PopoverContent>
    </Popover>
  );
}

function InboxMenu(props: {
  messages: AppMessage[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Messages" className="relative">
          <Bell size={16} />
          {props.messages.length ? <span className="inboxCount">{props.messages.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid max-h-[min(520px,calc(100vh-120px))] w-[min(420px,calc(100vw-28px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
        <div className="inboxHeader">
          <strong>Messages</strong>
          {props.messages.length ? (
            <Button size="sm" variant="ghost" onClick={props.onClear}>Clear</Button>
          ) : null}
        </div>
        {props.messages.length ? (
          <div className="inboxList">
            {props.messages.map((message) => (
              <div className={`inboxItem ${message.tone}`} key={message.id}>
                <div>
                  <strong>{message.title}</strong>
                  <p>{message.message}</p>
                  <small>{formatMessageTime(message.createdAt)}</small>
                </div>
                <Button variant="ghost" size="icon" aria-label="Delete message" onClick={() => props.onDelete(message.id)}>
                  <X size={13} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="inboxEmpty">No messages.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function GithubMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="githubMark">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.67 0 8.2c0 3.63 2.29 6.7 5.47 7.79.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.63.82-2.2-.08-.21-.36-1.04.08-2.17 0 0 .67-.22 2.2.84A7.4 7.4 0 0 1 8 3.96c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.13.16 1.96.08 2.17.51.57.82 1.3.82 2.2 0 3.14-1.87 3.83-3.65 4.04.29.26.54.75.54 1.51 0 1.09-.01 1.97-.01 2.24 0 .22.15.49.55.4A8.1 8.1 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"
      />
    </svg>
  );
}

function WorkspaceMenu(props: {
  workspaces: WorkspaceConfig[];
  activeWorkspaceId: string;
  onSelect: (workspaceId: string) => void;
  onAdd: () => void;
}) {
  const active = props.workspaces.find((workspace) => workspace.id === props.activeWorkspaceId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="workspaceTrigger">
          {active?.name ?? "Workspace"}
          <ChevronDown size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {props.workspaces.length ? (
          props.workspaces.map((workspace) => (
            <DropdownMenuItem key={workspace.id} onSelect={() => props.onSelect(workspace.id)}>
              <span className="workspaceItem">
                <strong>{workspace.name}</strong>
                <small>{workspace.repoSlug}</small>
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No workspaces</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={props.onAdd}>
          <Plus size={13} />
          Add Workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyWorkspaceState(props: { onAdd: (path: string, name?: string) => Promise<boolean> }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!path.trim()) return;
    setBusy(true);
    try {
      await props.onAdd(path.trim(), name.trim() || undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="emptyWorkspace">
      <h2>Add a workspace</h2>
      <p>Select a local Git repository with a GitHub remote. Agent Board stores workspace state under <code>~/.agent-board</code>.</p>
      <div className="workspaceForm">
        <Input value={path} placeholder="/path/to/repo" onChange={(event) => setPath(event.target.value)} />
        <Input value={name} placeholder="Display name (optional)" onChange={(event) => setName(event.target.value)} />
        <Button onClick={submit} disabled={!path.trim() || busy}>
          {busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
          Add Workspace
        </Button>
      </div>
    </Card>
  );
}

function AddWorkspaceDialog(props: {
  onCancel: () => void;
  onAdd: (path: string, name?: string) => Promise<boolean>;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!path.trim()) return;
    setBusy(true);
    try {
      await props.onAdd(path.trim(), name.trim() || undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open className="smallDialog">
      <DialogHeader>
        <div>
          <DialogTitle>Add Workspace</DialogTitle>
          <DialogDescription>Path must be a local Git repository with a GitHub remote.</DialogDescription>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={props.onCancel}><X size={16} /></Button>
      </DialogHeader>
      <div className="dialogBody">
        <div className="compactGrid">
          <Field label="Repository path" className="span2">
            <Input value={path} placeholder="/path/to/repo" onChange={(event) => setPath(event.target.value)} autoFocus />
          </Field>
          <Field label="Display name" className="span2">
            <Input value={name} placeholder="Optional" onChange={(event) => setName(event.target.value)} />
          </Field>
        </div>
      </div>
      <DialogFooter>
        <span />
        <div className="footerActions">
          <Button variant="outline" onClick={props.onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={!path.trim() || busy}>
            {busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}
            Add
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}

function BoardView(props: {
  board: RenderedBoard;
  selection: Selection | null;
  issuesDisabled: boolean;
  availableLabels: string[];
  itemRuns: Record<string, ItemRunState>;
  labelBusy: Record<string, boolean>;
  onToggle: (boardId: string, laneId: string, itemId: string) => void;
  onAction: (board: RenderedBoard, lane: RenderedLane, action: ActionConfig) => void;
  onAddLabel: (item: BoardItem, label: string) => void;
  onRemoveLabel: (item: BoardItem, label: string) => void;
}) {
  return (
    <section className="lanes" aria-label={props.board.title}>
      {props.board.lanes.map((lane) => {
        const selectedIds =
          props.selection?.boardId === props.board.id && props.selection.laneId === lane.id
            ? props.selection.selectedIds
            : [];
        return (
          <LaneView
            key={lane.id}
            board={props.board}
            lane={lane}
            selectedIds={selectedIds}
            issuesDisabled={props.issuesDisabled}
            availableLabels={props.availableLabels}
            itemRuns={props.itemRuns}
            labelBusy={props.labelBusy}
            onToggle={props.onToggle}
            onAction={props.onAction}
            onAddLabel={props.onAddLabel}
            onRemoveLabel={props.onRemoveLabel}
          />
        );
      })}
    </section>
  );
}

function LaneView(props: {
  board: RenderedBoard;
  lane: RenderedLane;
  selectedIds: string[];
  issuesDisabled: boolean;
  availableLabels: string[];
  itemRuns: Record<string, ItemRunState>;
  labelBusy: Record<string, boolean>;
  onToggle: (boardId: string, laneId: string, itemId: string) => void;
  onAction: (board: RenderedBoard, lane: RenderedLane, action: ActionConfig) => void;
  onAddLabel: (item: BoardItem, label: string) => void;
  onRemoveLabel: (item: BoardItem, label: string) => void;
}) {
  return (
    <Card className={props.issuesDisabled ? "lane disabled" : "lane"}>
      <div className="laneHeader">
        <div>
          <h2>{props.lane.title}</h2>
          <div className="laneSub">
            {props.selectedIds.length ? `${props.selectedIds.length} selected` : props.lane.missingLabels.length ? `Missing ${props.lane.missingLabels.length} labels` : "\u00a0"}
          </div>
        </div>
        <div className="laneHeaderActions">
          {props.selectedIds.length ? (
            <LaneActionsDropdown
              board={props.board}
              lane={props.lane}
              onAction={props.onAction}
            />
          ) : null}
          <Badge variant="outline">{props.issuesDisabled ? "-" : props.lane.items.length}</Badge>
        </div>
      </div>

      <div className="cards">
        {props.issuesDisabled ? (
          <div className="empty">Issues are disabled for this repository.</div>
        ) : props.lane.items.length ? (
          props.lane.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={props.selectedIds.includes(item.id)}
              runState={props.itemRuns[item.id] ?? null}
              availableLabels={props.availableLabels}
              labelBusy={props.labelBusy}
              onToggle={() => props.onToggle(props.board.id, props.lane.id, item.id)}
              onAddLabel={(label) => props.onAddLabel(item, label)}
              onRemoveLabel={(label) => props.onRemoveLabel(item, label)}
            />
          ))
        ) : (
          <div className="empty">No items here.</div>
        )}
      </div>
    </Card>
  );
}

function LaneActionsDropdown(props: {
  board: RenderedBoard;
  lane: RenderedLane;
  onAction: (board: RenderedBoard, lane: RenderedLane, action: ActionConfig) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Actions
          <ChevronDown size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {props.lane.actions.length ? (
          props.lane.actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              onSelect={() => props.onAction(props.board, props.lane, action)}
            >
              <Play size={13} />
              {action.title}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No actions</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ItemCard(props: {
  item: BoardItem;
  selected: boolean;
  runState: ItemRunState | null;
  availableLabels: string[];
  labelBusy: Record<string, boolean>;
  onToggle: () => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
}) {
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const datalistId = `labels-${props.item.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
  const runLabel = props.runState?.status === "starting" ? "starting" : props.runState?.status === "running" ? "running" : null;

  function submitLabel() {
    const label = labelInput.trim();
    if (!label) return;
    props.onAddLabel(label);
    setLabelInput("");
    setAddingLabel(false);
  }

  return (
    <Card className={props.selected ? "itemCard selected" : "itemCard"}>
      <div className="cardTop">
        <label className="cardCheck">
          <input type="checkbox" checked={props.selected} onChange={props.onToggle} />
          <span>{props.item.ref}</span>
        </label>
        <div className="cardTools">
          {runLabel ? (
            <Badge variant="warning" className="runBadge">
              <LoaderCircle className="spin" size={12} />
              {runLabel}
            </Badge>
          ) : null}
          <a className="externalLink" href={props.item.url} target="_blank" rel="noreferrer" aria-label="Open in GitHub">
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
      <a className="cardTitle" href={props.item.url} target="_blank" rel="noreferrer">
        {props.item.title}
      </a>
      <div className="cardMeta">
        <span>{props.item.author}</span>
        <span>{formatUpdated(props.item.updatedAt)}</span>
      </div>
      {"assignees" in props.item ? (
        <div className="cardMeta">Assignee: {props.item.assignees.length ? props.item.assignees.join(", ") : "none"}</div>
      ) : (
        <div className="cardMeta">
          {props.item.isDraft ? "draft" : "ready"} · {props.item.headRefName} → {props.item.baseRefName}
        </div>
      )}
      <div className="labels">
        {props.item.labels.length ? (
          props.item.labels.map((label) => {
            const busy = props.labelBusy[`${props.item.id}:remove:${label}`] === true;
            return (
              <Badge key={label} variant="secondary" className="labelPill">
                {label}
                <button
                  aria-label={`Remove ${label}`}
                  disabled={busy}
                  onClick={() => props.onRemoveLabel(label)}
                >
                  {busy ? <LoaderCircle className="spin" size={11} /> : <X size={11} />}
                </button>
              </Badge>
            );
          })
        ) : (
          <Badge variant="outline">no labels</Badge>
        )}
        <button className="labelAddButton" onClick={() => setAddingLabel((current) => !current)} aria-label="Add label">
          <Plus size={12} />
        </button>
      </div>
      {addingLabel ? (
        <div className="labelEditor">
          <Input
            value={labelInput}
            list={datalistId}
            placeholder="Add label"
            onChange={(event) => setLabelInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitLabel();
              if (event.key === "Escape") setAddingLabel(false);
            }}
            autoFocus
          />
          <datalist id={datalistId}>
            {props.availableLabels
              .filter((label) => !props.item.labels.includes(label))
              .map((label) => <option value={label} key={label} />)}
          </datalist>
          <Button size="sm" onClick={submitLabel} disabled={!labelInput.trim() || props.labelBusy[`${props.item.id}:add:${labelInput.trim()}`] === true}>
            Add
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function RunDialog(props: {
  dialog: RunDialogState;
  runners: Runner[];
  onCancel: () => void;
  onRun: (payload: {
    runnerId: string;
    permissionModeId: string;
    prompt: string;
    splitRuns: boolean;
    splitRunPrompts: Array<{ itemId: string; prompt: string }>;
  }) => void;
}) {
  const [runnerId, setRunnerId] = useState(props.dialog.runnerId);
  const [permissionModeId, setPermissionModeId] = useState("");
  const [prompt, setPrompt] = useState(props.dialog.prompt);
  const [splitRuns, setSplitRuns] = useState(false);
  const [splitPromptTemplate, setSplitPromptTemplate] = useState(props.dialog.action.promptTemplate);
  const supportsSplit = props.dialog.selectedItems.length > 1;
  const promptValue = splitRuns ? splitPromptTemplate : prompt;
  const splitRunPrompts = useMemo(
    () => props.dialog.selectedItems.map((item) => ({
      item,
      prompt: renderPromptTemplate(splitPromptTemplate, [item])
    })),
    [props.dialog.selectedItems, splitPromptTemplate]
  );
  const selectedRunner = useMemo(
    () => props.runners.find((runner) => runner.id === runnerId),
    [props.runners, runnerId]
  );
  const permissionModes = selectedRunner?.permissionModes ?? [];
  const selectedPermissionMode = permissionModes.find((mode) => mode.id === permissionModeId);
  const cliPreviewLines = useMemo(() => {
    if (!selectedRunner) return [];
    const prompts = splitRuns ? splitRunPrompts.map((entry) => entry.prompt) : [prompt];
    return prompts.map((nextPrompt) => renderCliPreview(selectedRunner, selectedPermissionMode, nextPrompt));
  }, [selectedRunner, selectedPermissionMode, splitRuns, splitRunPrompts, prompt]);

  useEffect(() => {
    const nextMode = selectedRunner?.defaultPermissionMode || permissionModes.find((mode) => mode.id === "default")?.id || permissionModes[0]?.id || "";
    setPermissionModeId(nextMode);
  }, [selectedRunner?.id]);

  return (
    <Dialog open className="runDialog">
      <DialogHeader>
        <div>
          <DialogTitle>Run Action</DialogTitle>
          <DialogDescription>{props.dialog.action.title} · {props.dialog.selectedRefs.join(" ")}</DialogDescription>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={props.onCancel}><X size={16} /></Button>
      </DialogHeader>

      <div className="dialogBody">
        <div className="compactGrid">
          <Field label="Working directory" className="span2">
            <div className="path">{props.dialog.cwd}</div>
          </Field>
          <Field label="Runner" className="span2">
            <div className="runnerList">
              {props.runners.map((runner) => (
                <label key={runner.id} className={!runner.detected && runner.id !== "custom" ? "runner muted" : "runner"}>
                  <input
                    type="radio"
                    name="runner"
                    checked={runnerId === runner.id}
                    onChange={() => setRunnerId(runner.id)}
                  />
                  <span>{runner.label}</span>
                  <Badge variant={runner.detected ? "success" : "outline"}>{runner.detected ? "detected" : "missing"}</Badge>
                </label>
              ))}
            </div>
          </Field>
          {permissionModes.length ? (
            <Field label="Permission mode" className="span2">
              <div className="permissionModeList">
                {permissionModes.map((mode) => (
                  <label key={mode.id} className="permissionMode" title={mode.description}>
                    <input
                      type="radio"
                      name="permissionMode"
                      checked={permissionModeId === mode.id}
                      onChange={() => setPermissionModeId(mode.id)}
                    />
                    <strong>{mode.label}</strong>
                    {mode.description ? <small>{mode.description}</small> : null}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          {supportsSplit ? (
            <label className="checkRow span2">
              <input
                type="checkbox"
                checked={splitRuns}
                onChange={(event) => setSplitRuns(event.target.checked)}
              />
              分开执行，每个 Issue 或 PR 创建一个 terminal 并行运行
            </label>
          ) : null}
          <Field label={splitRuns ? "Prompt template" : "Prompt"} className="span2">
            <Textarea
              value={promptValue}
              onChange={(event) => {
                if (splitRuns) setSplitPromptTemplate(event.target.value);
                else setPrompt(event.target.value);
              }}
              rows={8}
            />
          </Field>
          {splitRuns ? (
            <div className="splitPromptPreview span2">
              <div className="previewHeader">Per-item prompts</div>
              {splitRunPrompts.map(({ item, prompt: itemPrompt }) => (
                <div className="previewItem" key={item.id}>
                  <Badge variant="secondary">{item.ref}</Badge>
                  <pre>{itemPrompt}</pre>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <div className="footerMeta">
          <span className="muted">{selectedRunner?.label ?? "No runner selected"}</span>
          {cliPreviewLines.length ? (
            <div className="cliPreview">
              <span>CLI</span>
              <code>{cliPreviewLines[0]}</code>
              {cliPreviewLines.length > 1 ? <small>+{cliPreviewLines.length - 1} split runs</small> : null}
            </div>
          ) : null}
        </div>
        <div className="footerActions">
          <Button variant="outline" onClick={props.onCancel}>Cancel</Button>
          <Button
            onClick={() =>
              props.onRun({
                runnerId,
                permissionModeId,
                prompt,
                splitRuns,
                splitRunPrompts: splitRunPrompts.map(({ item, prompt: itemPrompt }) => ({
                  itemId: item.id,
                  prompt: itemPrompt
                }))
              })
            }
          >
            <Play size={15} />
            {splitRuns ? `Run ${splitRunPrompts.length}` : "Run"}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}

function ConfigDialog(props: {
  open: boolean;
  config: WorkflowConfig;
  appConfig: AgentBoardConfig | null;
  terminalTools: TerminalTool[];
  onChange: (config: WorkflowConfig) => void;
  onAppConfigChange: (config: AgentBoardConfig) => void;
  onAddWorkspace: () => void;
  onCancel: () => void;
  onSave: (config: WorkflowConfig, appConfig: AgentBoardConfig) => void;
}) {
  const [activeBoardId, setActiveBoardId] = useState(props.config.boards[0]?.id ?? "");
  const [section, setSection] = useState<"workspaces" | "boards" | "runners" | "terminal">("boards");
  const activeBoard = props.config.boards.find((board) => board.id === activeBoardId) ?? props.config.boards[0];
  const [activeLaneId, setActiveLaneId] = useState(activeBoard?.lanes[0]?.id ?? "");
  const activeLane = activeBoard?.lanes.find((lane) => lane.id === activeLaneId) ?? activeBoard?.lanes[0];

  useEffect(() => {
    if (!props.config.boards.some((board) => board.id === activeBoardId)) {
      setActiveBoardId(props.config.boards[0]?.id ?? "");
    }
  }, [activeBoardId, props.config.boards]);

  useEffect(() => {
    if (activeBoard && !activeBoard.lanes.some((lane) => lane.id === activeLaneId)) {
      setActiveLaneId(activeBoard.lanes[0]?.id ?? "");
    }
  }, [activeBoard, activeLaneId]);

  function updateBoard(boardId: string, patch: Partial<BoardConfig>) {
    props.onChange({
      ...props.config,
      boards: props.config.boards.map((board) => board.id === boardId ? { ...board, ...patch } : board)
    });
  }

  function updateLane(boardId: string, laneId: string, patch: Partial<LaneConfig>) {
    props.onChange({
      ...props.config,
      boards: props.config.boards.map((board) => {
        if (board.id !== boardId) return board;
        return {
          ...board,
          lanes: board.lanes.map((lane) => lane.id === laneId ? { ...lane, ...patch } : lane)
        };
      })
    });
  }

  function updateLaneQuery(boardId: string, laneId: string, patch: Partial<LaneQuery>) {
    if (!activeLane) return;
    updateLane(boardId, laneId, { query: { ...activeLane.query, ...patch } });
  }

  function addLane(boardId: string) {
    const board = props.config.boards.find((candidate) => candidate.id === boardId);
    if (!board) return;
    const id = uniqueId("lane", board.lanes.map((lane) => lane.id));
    const lane: LaneConfig = { id, title: "New Lane", query: {}, actions: [] };
    updateBoard(boardId, { lanes: [...board.lanes, lane] });
    setActiveLaneId(id);
  }

  function removeLane(boardId: string, laneId: string) {
    const board = props.config.boards.find((candidate) => candidate.id === boardId);
    if (!board) return;
    updateBoard(boardId, { lanes: board.lanes.filter((lane) => lane.id !== laneId) });
  }

  function addAction(boardId: string, laneId: string) {
    const lane = activeLane;
    if (!lane) return;
    const id = uniqueId("action", lane.actions.map((action) => action.id));
    updateLane(boardId, laneId, {
      actions: [
        ...lane.actions,
        { id, title: "New Action", promptTemplate: "/triage {{refs}}" }
      ]
    });
  }

  function updateAction(boardId: string, laneId: string, actionId: string, patch: Partial<ActionConfig>) {
    if (!activeLane) return;
    updateLane(boardId, laneId, {
      actions: activeLane.actions.map((action) => action.id === actionId ? { ...action, ...patch } : action)
    });
  }

  function removeAction(boardId: string, laneId: string, actionId: string) {
    if (!activeLane) return;
    updateLane(boardId, laneId, {
      actions: activeLane.actions.filter((action) => action.id !== actionId)
    });
  }

  function updateRunner(runnerId: string, patch: Partial<RunnerConfig>) {
    props.onChange({
      ...props.config,
      runners: (props.config.runners ?? []).map((runner) => runner.id === runnerId ? { ...runner, ...patch } : runner)
    });
  }

  function addRunner() {
    const runners = props.config.runners ?? [];
    const id = uniqueId("runner", runners.map((runner) => runner.id));
    props.onChange({
      ...props.config,
      runners: [...runners, { id, label: "New Runner", command: "my-agent-cli", args: ["{{prompt}}"] }]
    });
    setSection("runners");
  }

  function removeRunner(runnerId: string) {
    props.onChange({
      ...props.config,
      runners: (props.config.runners ?? []).filter((runner) => runner.id !== runnerId)
    });
  }

  function updateTerminal(patch: Partial<TerminalConfig>) {
    props.onChange({
      ...props.config,
      terminal: {
        ...terminalConfigOf(props.config.terminal),
        ...patch
      }
    });
  }

  function updateWorkspace(workspaceId: string, patch: Partial<WorkspaceConfig>) {
    if (!props.appConfig) return;
    props.onAppConfigChange({
      ...props.appConfig,
      workspaces: props.appConfig.workspaces.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, ...patch } : workspace
      )
    });
  }

  function removeWorkspace(workspaceId: string) {
    if (!props.appConfig) return;
    props.onAppConfigChange({
      ...props.appConfig,
      lastUsedWorkspaceId: props.appConfig.lastUsedWorkspaceId === workspaceId ? props.appConfig.workspaces.find((workspace) => workspace.id !== workspaceId)?.id : props.appConfig.lastUsedWorkspaceId,
      workspaces: props.appConfig.workspaces.filter((workspace) => workspace.id !== workspaceId)
    });
  }

  return (
    <Dialog open={props.open} className="configDialog">
      <DialogHeader>
        <div>
          <DialogTitle>Board Configuration</DialogTitle>
          <DialogDescription>Edit boards, lanes, label queries, actions, and prompt templates.</DialogDescription>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={props.onCancel}><X size={16} /></Button>
      </DialogHeader>

      <div className="configLayout">
        <aside className="configSidebar">
          <Button variant={section === "workspaces" ? "default" : "ghost"} size="sm" onClick={() => setSection("workspaces")}>
            Workspaces
          </Button>
          <Button variant={section === "boards" ? "default" : "ghost"} size="sm" onClick={() => setSection("boards")}>
            Boards
          </Button>
          <Button variant={section === "runners" ? "default" : "ghost"} size="sm" onClick={() => setSection("runners")}>
            Runners
          </Button>
          <Button variant={section === "terminal" ? "default" : "ghost"} size="sm" onClick={() => setSection("terminal")}>
            Terminal
          </Button>
          <Separator />
          {section === "boards" ? <div className="sidebarTitle">Boards</div> : null}
          {section === "boards" ? (
          <>
          {props.config.boards.map((board) => (
            <Button
              key={board.id}
              variant={board.id === activeBoard?.id ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveBoardId(board.id);
                setActiveLaneId(board.lanes[0]?.id ?? "");
              }}
            >
              {board.title}
            </Button>
          ))}
          </>
          ) : null}
        </aside>

        {section === "workspaces" ? (
          <WorkspacesConfig
            workspaces={props.appConfig?.workspaces ?? []}
            onAdd={props.onAddWorkspace}
            onUpdate={updateWorkspace}
            onRemove={removeWorkspace}
          />
        ) : section === "runners" ? (
          <RunnersConfig
            runners={props.config.runners ?? []}
            onAdd={addRunner}
            onUpdate={updateRunner}
            onRemove={removeRunner}
          />
        ) : section === "terminal" ? (
          <TerminalConfigPanel
            config={terminalConfigOf(props.config.terminal)}
            tools={props.terminalTools}
            onUpdate={updateTerminal}
          />
        ) : activeBoard ? (
          <section className="configPanel">
            <div className="configSection">
              <div className="sectionHeader">
                <div>
                  <h3>Board</h3>
                  <p>{activeBoard.itemType}</p>
                </div>
              </div>
              <div className="compactGrid">
                <Field label="Board id">
                  <Input value={activeBoard.id} disabled />
                </Field>
                <Field label="Board title">
                  <Input value={activeBoard.title} onChange={(event) => updateBoard(activeBoard.id, { title: event.target.value })} />
                </Field>
              </div>
            </div>

            <Separator />

            <div className="configSection">
              <div className="sectionHeader">
                <div>
                  <h3>Lanes</h3>
                  <p>Map lanes to GitHub label queries.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addLane(activeBoard.id)}>
                  <Plus size={14} />
                  Lane
                </Button>
              </div>
              <div className="laneEditor">
                <div className="laneList">
                  {activeBoard.lanes.map((lane) => (
                    <button
                      key={lane.id}
                      className={lane.id === activeLane?.id ? "laneListItem active" : "laneListItem"}
                      onClick={() => setActiveLaneId(lane.id)}
                    >
                      <span>{lane.title}</span>
                      <small>{lane.id}</small>
                    </button>
                  ))}
                </div>

                {activeLane ? (
                  <div className="laneForm">
                    <div className="compactGrid">
                      <Field label="Lane id">
                        <Input value={activeLane.id} onChange={(event) => updateLane(activeBoard.id, activeLane.id, { id: slugify(event.target.value) })} />
                      </Field>
                      <Field label="Lane title">
                        <Input value={activeLane.title} onChange={(event) => updateLane(activeBoard.id, activeLane.id, { title: event.target.value })} />
                      </Field>
                      <Field label="Labels all">
                        <Input value={formatCsv(activeLane.query.labelsAll)} onChange={(event) => updateLaneQuery(activeBoard.id, activeLane.id, { labelsAll: parseCsv(event.target.value) })} />
                      </Field>
                      <Field label="Labels any">
                        <Input value={formatCsv(activeLane.query.labelsAny)} onChange={(event) => updateLaneQuery(activeBoard.id, activeLane.id, { labelsAny: parseCsv(event.target.value) })} />
                      </Field>
                      <Field label="Labels none" className="span2">
                        <Input value={formatCsv(activeLane.query.labelsNone)} onChange={(event) => updateLaneQuery(activeBoard.id, activeLane.id, { labelsNone: parseCsv(event.target.value) })} />
                      </Field>
                      <label className="checkRow">
                        <input
                          type="checkbox"
                          checked={activeLane.query.includeUnlabeled === true}
                          onChange={(event) => updateLaneQuery(activeBoard.id, activeLane.id, { includeUnlabeled: event.target.checked || undefined })}
                        />
                        Include unlabeled
                      </label>
                      <label className="checkRow">
                        <input
                          type="checkbox"
                          checked={activeLane.query.noAssignee === true}
                          onChange={(event) => updateLaneQuery(activeBoard.id, activeLane.id, { noAssignee: event.target.checked || undefined })}
                        />
                        No assignee
                      </label>
                    </div>

                    <div className="sectionHeader tight">
                      <div>
                        <h3>Actions</h3>
                        <p>Prompt templates are rendered when a lane action runs.</p>
                      </div>
                      <div className="headerActions">
                        <Button size="sm" variant="outline" onClick={() => addAction(activeBoard.id, activeLane.id)}>
                          <Plus size={14} />
                          Action
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => removeLane(activeBoard.id, activeLane.id)}>
                          <Trash2 size={14} />
                          Lane
                        </Button>
                      </div>
                    </div>
                    <div className="promptVariables">
                      <span><code>{"{{refs}}"}</code> all selected refs, space-separated</span>
                      <span><code>{"{{ref}}"}</code> first selected ref</span>
                      <span><code>{"{{count}}"}</code> selected item count</span>
                      <span><code>{"{{itemsJson}}"}</code> selected items as JSON</span>
                    </div>

                    <div className="actionConfigList">
                      {activeLane.actions.map((action) => (
                        <Card className="actionConfig" key={action.id}>
                          <div className="compactGrid">
                            <Field label="Action id">
                              <Input value={action.id} onChange={(event) => updateAction(activeBoard.id, activeLane.id, action.id, { id: slugify(event.target.value) })} />
                            </Field>
                            <Field label="Title">
                              <Input value={action.title} onChange={(event) => updateAction(activeBoard.id, activeLane.id, action.id, { title: event.target.value })} />
                            </Field>
                            <Field label="Runner">
                              <Input value={action.runner ?? ""} placeholder="default" onChange={(event) => updateAction(activeBoard.id, activeLane.id, action.id, { runner: event.target.value || undefined })} />
                            </Field>
                            <Field label="Prompt" className="span2">
                              <Textarea rows={3} value={action.promptTemplate} onChange={(event) => updateAction(activeBoard.id, activeLane.id, action.id, { promptTemplate: event.target.value })} />
                            </Field>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeAction(activeBoard.id, activeLane.id, action.id)}>
                            <Trash2 size={14} />
                            Remove action
                          </Button>
                        </Card>
                      ))}
                      {!activeLane.actions.length ? <div className="empty small">No actions configured for this lane.</div> : null}
                    </div>
                  </div>
                ) : (
                  <div className="empty">No lane selected.</div>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <DialogFooter>
        <span className="muted">Saving writes to <code>~/.agent-board/config.yml</code> and the current workspace workflow.</span>
        <div className="footerActions">
          <Button variant="outline" onClick={props.onCancel}>Cancel</Button>
          <Button onClick={() => props.appConfig ? props.onSave(props.config, props.appConfig) : undefined}>
            <Save size={15} />
            Save Configuration
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}

function WorkspacesConfig(props: {
  workspaces: WorkspaceConfig[];
  onAdd: () => void;
  onUpdate: (workspaceId: string, patch: Partial<WorkspaceConfig>) => void;
  onRemove: (workspaceId: string) => void;
}) {
  return (
    <section className="configPanel">
      <div className="configSection">
        <div className="sectionHeader">
          <div>
            <h3>Workspaces</h3>
            <p>Workspace entries are stored globally under ~/.agent-board. Removing an entry does not delete run history or repo files.</p>
          </div>
          <Button size="sm" variant="outline" onClick={props.onAdd}>
            <Plus size={14} />
            Workspace
          </Button>
        </div>
        <div className="workspaceConfigList">
          {props.workspaces.map((workspace) => (
            <Card className="workspaceConfig" key={workspace.id}>
              <div className="compactGrid">
                <Field label="Name">
                  <Input value={workspace.name} onChange={(event) => props.onUpdate(workspace.id, { name: event.target.value })} />
                </Field>
                <Field label="Repository">
                  <Input value={workspace.repoSlug} disabled />
                </Field>
                <Field label="Git root" className="span2">
                  <Input value={workspace.gitRoot} disabled />
                </Field>
              </div>
              <Button size="sm" variant="ghost" onClick={() => props.onRemove(workspace.id)}>
                <Trash2 size={14} />
                Remove workspace
              </Button>
            </Card>
          ))}
          {!props.workspaces.length ? <div className="empty small">No workspaces configured.</div> : null}
        </div>
      </div>
    </section>
  );
}

function RunnersConfig(props: {
  runners: RunnerConfig[];
  onAdd: () => void;
  onUpdate: (runnerId: string, patch: Partial<RunnerConfig>) => void;
  onRemove: (runnerId: string) => void;
}) {
  function addPermissionMode(runner: RunnerConfig) {
    const modes = runner.permissionModes ?? [];
    const id = uniqueId("mode", modes.map((mode) => mode.id));
    props.onUpdate(runner.id, {
      permissionModes: [...modes, { id, label: "New Mode", args: [], description: "" }],
      defaultPermissionMode: runner.defaultPermissionMode ?? id
    });
  }

  function updatePermissionMode(
    runner: RunnerConfig,
    modeId: string,
    patch: Partial<RunnerPermissionMode>
  ) {
    props.onUpdate(runner.id, {
      permissionModes: (runner.permissionModes ?? []).map((mode) => mode.id === modeId ? { ...mode, ...patch } : mode),
      defaultPermissionMode: patch.id && runner.defaultPermissionMode === modeId ? patch.id : runner.defaultPermissionMode
    });
  }

  function removePermissionMode(runner: RunnerConfig, modeId: string) {
    const nextModes = (runner.permissionModes ?? []).filter((mode) => mode.id !== modeId);
    props.onUpdate(runner.id, {
      permissionModes: nextModes,
      defaultPermissionMode: runner.defaultPermissionMode === modeId ? nextModes[0]?.id : runner.defaultPermissionMode
    });
  }

  return (
    <section className="configPanel">
      <div className="configSection">
        <div className="sectionHeader">
          <div>
            <h3>Runners</h3>
            <p>Configure Codex, Claude Code, and custom interactive TUI runners.</p>
          </div>
          <Button size="sm" variant="outline" onClick={props.onAdd}>
            <Plus size={14} />
            Runner
          </Button>
        </div>
        <div className="runnerConfigList">
          {props.runners.map((runner, index) => (
            <Card className="runnerConfig" key={`runner-${index}`}>
              <div className="compactGrid">
                <Field label="Runner id">
                  <Input value={runner.id} onChange={(event) => props.onUpdate(runner.id, { id: slugify(event.target.value) })} />
                </Field>
                <Field label="Label">
                  <Input value={runner.label} onChange={(event) => props.onUpdate(runner.id, { label: event.target.value })} />
                </Field>
                <Field label="Command">
                  <Input value={runner.command} onChange={(event) => props.onUpdate(runner.id, { command: event.target.value })} />
                </Field>
                <Field label="Args">
                  <Input value={runner.args.join(" ")} onChange={(event) => props.onUpdate(runner.id, { args: splitArgs(event.target.value) })} />
                </Field>
              </div>
              <div className="runnerHelp">
                Use <code>{"{{prompt}}"}</code> where the rendered prompt should be inserted. The command opens in an interactive terminal.
              </div>
              <div className="permissionConfigHeader">
                <div>
                  <h4>Permission modes</h4>
                  <p>Args are prepended before runner args when the action starts.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addPermissionMode(runner)}>
                  <Plus size={14} />
                  Mode
                </Button>
              </div>
              {runner.permissionModes?.length ? (
                <div className="permissionConfigList">
                  <Field label="Default mode">
                    <select
                      className="selectInput"
                      value={runner.defaultPermissionMode ?? runner.permissionModes[0]?.id ?? ""}
                      onChange={(event) => props.onUpdate(runner.id, { defaultPermissionMode: event.target.value || undefined })}
                    >
                      {runner.permissionModes.map((mode) => (
                        <option key={mode.id} value={mode.id}>{mode.label}</option>
                      ))}
                    </select>
                  </Field>
                  {runner.permissionModes.map((mode, modeIndex) => (
                    <Card className="permissionConfig" key={`permission-${index}-${modeIndex}`}>
                      <div className="compactGrid">
                        <Field label="Mode id">
                          <Input value={mode.id} onChange={(event) => updatePermissionMode(runner, mode.id, { id: slugify(event.target.value) })} />
                        </Field>
                        <Field label="Label">
                          <Input value={mode.label} onChange={(event) => updatePermissionMode(runner, mode.id, { label: event.target.value })} />
                        </Field>
                        <Field label="Args" className="span2">
                          <Input value={mode.args.join(" ")} onChange={(event) => updatePermissionMode(runner, mode.id, { args: splitArgs(event.target.value) })} />
                        </Field>
                        <Field label="Description" className="span2">
                          <Input value={mode.description ?? ""} onChange={(event) => updatePermissionMode(runner, mode.id, { description: event.target.value })} />
                        </Field>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removePermissionMode(runner, mode.id)}>
                        <Trash2 size={14} />
                        Remove mode
                      </Button>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="empty small">No permission modes configured.</div>
              )}
              <Button size="sm" variant="ghost" onClick={() => props.onRemove(runner.id)}>
                <Trash2 size={14} />
                Remove runner
              </Button>
            </Card>
          ))}
          {!props.runners.length ? <div className="empty small">No runners configured.</div> : null}
        </div>
      </div>
    </section>
  );
}

function TerminalConfigPanel(props: {
  config: TerminalConfig;
  tools: TerminalTool[];
  onUpdate: (patch: Partial<TerminalConfig>) => void;
}) {
  const selectedTool = props.tools.find((tool) => tool.id === props.config.id);
  const openMode = selectedTool?.supportsTabs ? props.config.openMode : "window";

  return (
    <section className="configPanel">
      <div className="configSection">
        <div className="sectionHeader">
          <div>
            <h3>Terminal</h3>
            <p>Choose which terminal app opens interactive runner sessions.</p>
          </div>
        </div>

        <div className="terminalToolGrid">
          {props.tools.map((tool) => (
            <button
              key={tool.id}
              className={tool.id === props.config.id ? "terminalTool active" : "terminalTool"}
              disabled={!tool.detected}
              onClick={() => props.onUpdate({ id: tool.id })}
            >
              <span className="terminalToolTitle">
                <SquareTerminal size={16} />
                {tool.label}
              </span>
              <span className="terminalToolMeta">
                <Badge variant={tool.detected ? "success" : "outline"}>{tool.detected ? "detected" : "missing"}</Badge>
                <Badge variant={tool.supportsTabs ? "secondary" : "outline"}>{tool.supportsTabs ? "tabs" : "window only"}</Badge>
              </span>
            </button>
          ))}
        </div>

        <Separator />

        <div className="terminalAdvanced">
          <div>
            <h3>Advanced</h3>
            <p>Tab mode is only used when the selected terminal supports it.</p>
          </div>
          <div className="segmented">
            <button
              className={openMode === "window" ? "active" : ""}
              onClick={() => props.onUpdate({ openMode: "window" })}
            >
              Window
            </button>
            <button
              className={openMode === "tab" ? "active" : ""}
              disabled={!selectedTool?.supportsTabs}
              onClick={() => props.onUpdate({ openMode: "tab" })}
            >
              Tab
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`field ${props.className ?? ""}`}>
      <Label>{props.label}</Label>
      {props.children}
    </div>
  );
}

function detectedRunnerCount(runners: Runner[]): number {
  return runners.filter((runner) => runner.detected).length;
}

function pruneFinishedRuns(
  current: Record<string, ItemRunState>,
  finishedRunIds: Set<string>
): Record<string, ItemRunState> {
  const next: Record<string, ItemRunState> = {};
  for (const [itemId, runState] of Object.entries(current)) {
    const runIds = runState.runIds.filter((runId) => !finishedRunIds.has(runId));
    if (runIds.length) next[itemId] = { runIds, status: "running" };
  }
  return next;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function nextThemePreference(preference: ThemePreference): ThemePreference {
  if (preference === "system") return "light";
  if (preference === "light") return "dark";
  return "system";
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function splitArgs(value: string): string[] {
  return value.split(" ").map((part) => part.trim()).filter(Boolean);
}

function renderCliPreview(runner: Runner, permissionMode: RunnerPermissionMode | undefined, prompt: string): string {
  const args = [
    ...(permissionMode?.args ?? []),
    ...runner.args
  ].map((arg) => arg.replaceAll("{{prompt}}", prompt));
  return [runner.command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (!value) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function renderPromptTemplate(template: string, items: BoardItem[]): string {
  const refs = items.map((item) => item.ref);
  return template
    .replaceAll("{{refs}}", refs.join(" "))
    .replaceAll("{{ref}}", refs[0] ?? "")
    .replaceAll("{{count}}", String(items.length))
    .replaceAll("{{itemsJson}}", JSON.stringify(items, null, 2));
}

function chooseDefaultRunner(runners: Runner[]): string {
  return runners.find((runner) => runner.detected)?.id ?? runners[0]?.id ?? "";
}

function terminalConfigOf(config: TerminalConfig | undefined): TerminalConfig {
  return config ?? { id: "system", openMode: "window" };
}

function parseCsv(value: string): string[] | undefined {
  const parsed = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
}

function formatCsv(value: string[] | undefined): string {
  return value?.join(", ") ?? "";
}

function cloneConfig(config: WorkflowConfig): WorkflowConfig {
  return JSON.parse(JSON.stringify(config)) as WorkflowConfig;
}

function cloneAppConfig(config: AgentBoardConfig): AgentBoardConfig {
  return JSON.parse(JSON.stringify(config)) as AgentBoardConfig;
}

function apiPath(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

function updateWorkspaceUrl(workspaceId: string): void {
  const url = new URL(window.location.href);
  if (workspaceId) url.searchParams.set("workspace", workspaceId);
  else url.searchParams.delete("workspace");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function uniqueId(prefix: string, existing: string[]): string {
  let index = existing.length + 1;
  let id = `${prefix}-${index}`;
  while (existing.includes(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

createRoot(document.getElementById("root")!).render(<App />);
