import type { GithubIssue, GithubPullRequest, GithubRepo } from "../shared/types.ts";
import { log, time } from "./logger.ts";
import { requireCommand, runCommand } from "./process.ts";

type GhLabel = { name: string };
type GhUser = { login: string };

export async function detectGhStatus(): Promise<string | null> {
  return time("github.auth_status", {}, async () => {
    const result = await runCommand(["gh", "auth", "status"]);
    if (result.exitCode !== 0) return result.stderr || result.stdout || "gh auth status failed";
    return null;
  });
}

export async function fetchRepo(slug: string): Promise<GithubRepo> {
  const raw = await time("github.fetch_repo", { repo: slug }, () =>
    requireCommand([
      "gh",
      "repo",
      "view",
      slug,
      "--json",
      "nameWithOwner,url,defaultBranchRef,viewerPermission,hasIssuesEnabled,labels"
    ])
  );
  const parsed = JSON.parse(raw) as {
    nameWithOwner: string;
    url: string;
    defaultBranchRef?: { name?: string };
    viewerPermission: string;
    hasIssuesEnabled?: boolean;
    labels?: GhLabel[];
  };

  return {
    nameWithOwner: parsed.nameWithOwner,
    url: parsed.url,
    defaultBranch: parsed.defaultBranchRef?.name ?? "main",
    viewerPermission: parsed.viewerPermission,
    issuesEnabled: parsed.hasIssuesEnabled ?? null,
    labels: (parsed.labels ?? []).map((label) => label.name)
  };
}

export async function fetchIssues(slug: string): Promise<GithubIssue[]> {
  const result = await time("github.fetch_issues", { repo: slug }, () =>
    runCommand([
      "gh",
      "issue",
      "list",
      "--repo",
      slug,
      "--state",
      "open",
      "--limit",
      "200",
      "--json",
      "number,title,url,state,labels,assignees,author,createdAt,updatedAt"
    ])
  );

  if (result.exitCode !== 0) {
    if (result.stderr.includes("disabled issues")) {
      log("warn", "github.issues_disabled", { repo: slug });
      return [];
    }
    throw new Error(result.stderr || result.stdout);
  }

  const parsed = JSON.parse(result.stdout || "[]") as Array<{
    number: number;
    title: string;
    url: string;
    state: string;
    labels: GhLabel[];
    assignees: GhUser[];
    author?: GhUser;
    createdAt: string;
    updatedAt: string;
  }>;

  log("info", "github.fetch_issues.count", { repo: slug, count: parsed.length });
  return parsed.map((issue) => ({
    itemType: "issue",
    id: `issue:${issue.number}`,
    number: issue.number,
    ref: `#${issue.number}`,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    labels: issue.labels.map((label) => label.name),
    assignees: issue.assignees.map((user) => user.login),
    author: issue.author?.login ?? "unknown",
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  }));
}

export async function fetchPullRequests(slug: string): Promise<GithubPullRequest[]> {
  const raw = await time("github.fetch_pull_requests", { repo: slug }, () =>
    requireCommand([
      "gh",
      "pr",
      "list",
      "--repo",
      slug,
      "--state",
      "open",
      "--limit",
      "200",
      "--json",
      "number,title,url,state,isDraft,labels,author,headRefName,baseRefName,reviewDecision,createdAt,updatedAt"
    ])
  );

  const parsed = JSON.parse(raw || "[]") as Array<{
    number: number;
    title: string;
    url: string;
    state: string;
    isDraft: boolean;
    labels: GhLabel[];
    author?: GhUser;
    headRefName: string;
    baseRefName: string;
    reviewDecision?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;

  log("info", "github.fetch_pull_requests.count", { repo: slug, count: parsed.length });
  return parsed.map((pr) => ({
    itemType: "pullRequest",
    id: `pullRequest:${pr.number}`,
    number: pr.number,
    ref: `#${pr.number}`,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    isDraft: pr.isDraft,
    labels: pr.labels.map((label) => label.name),
    author: pr.author?.login ?? "unknown",
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    reviewDecision: pr.reviewDecision ?? null,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt
  }));
}

export async function updateGithubLabels(
  slug: string,
  itemType: "issue" | "pullRequest",
  number: number,
  action: "add" | "remove",
  label: string
): Promise<void> {
  const command = itemType === "issue" ? "issue" : "pr";
  const labelFlag = action === "add" ? "--add-label" : "--remove-label";
  await time("github.update_labels", { repo: slug, itemType, number, action, label }, async () => {
    let result = await runCommand([
      "gh",
      command,
      "edit",
      String(number),
      "--repo",
      slug,
      labelFlag,
      label
    ]);

    if (result.exitCode !== 0 && action === "add" && labelMissing(result.stderr || result.stdout, label)) {
      await createGithubLabel(slug, label);
      result = await runCommand([
        "gh",
        command,
        "edit",
        String(number),
        "--repo",
        slug,
        labelFlag,
        label
      ]);
    }

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `Failed to update ${itemType} label.`);
    }
  });
}

async function createGithubLabel(slug: string, label: string): Promise<void> {
  await time("github.create_label", { repo: slug, label }, async () => {
    const result = await runCommand([
      "gh",
      "label",
      "create",
      label,
      "--repo",
      slug,
      "--color",
      "ededed"
    ]);
    if (result.exitCode !== 0 && !labelAlreadyExists(result.stderr || result.stdout)) {
      throw new Error(result.stderr || result.stdout || `Failed to create label ${label}.`);
    }
  });
}

function labelMissing(output: string, label: string): boolean {
  return output.includes(`'${label}' not found`) || output.includes(`\"${label}\" not found`);
}

function labelAlreadyExists(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes("already exists") || normalized.includes("already_exists");
}
