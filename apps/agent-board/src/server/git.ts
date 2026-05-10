import { requireCommand } from "./process.ts";
import { time } from "./logger.ts";

export type GithubRemote = {
  name: string;
  url: string;
  owner: string;
  repo: string;
  slug: string;
};

export async function findGitRoot(cwd: string): Promise<string> {
  return time("git.find_root", { cwd }, () =>
    requireCommand(["git", "rev-parse", "--show-toplevel"], {
      cwd,
      label: "git root discovery"
    })
  );
}

export async function findFirstGithubRemote(gitRoot: string): Promise<GithubRemote> {
  const output = await time("git.find_remote", { gitRoot }, () =>
    requireCommand(["git", "remote", "-v"], {
      cwd: gitRoot,
      label: "git remote discovery"
    })
  );

  const seen = new Set<string>();
  for (const line of output.split("\n")) {
    const [name, rawUrl] = line.trim().split(/\s+/);
    if (!name || !rawUrl) continue;
    const parsed = parseGithubRemote(rawUrl);
    if (!parsed) continue;
    const key = `${name}:${parsed.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    return {
      name,
      url: rawUrl,
      ...parsed
    };
  }

  throw new Error("No GitHub remote found in this git repository.");
}

export function parseGithubRemote(url: string): Omit<GithubRemote, "name" | "url"> | null {
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return { owner, repo, slug: `${owner}/${repo}` };
  }

  const httpsMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    return { owner, repo, slug: `${owner}/${repo}` };
  }

  return null;
}
