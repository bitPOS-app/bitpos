import { Router, type IRouter } from "express";
import { execSync } from "child_process";
import path from "path";

const router: IRouter = Router();

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../");

export interface ChangelogEntry {
  id: string;
  type: "release" | "commit";
  version?: string;
  title: string;
  bullets: string[];
  date: string;
  url: string;
}

const REPO_URL = "https://github.com/bitPOS-app/bitpos";
const CACHE_TTL_MS = 2 * 60 * 1000;

let cache: { data: ChangelogEntry[]; fetchedAt: number } | null = null;

const SKIP_PATTERNS = [
  /^published your app$/i,
  /^transitioned from (plan|build) to (build|plan) mode$/i,
  /^update (application )?version( information)?/i,
  /^update comment/i,
  /^merge (pull request|branch)/i,
  /^bump version/i,
  /^\[skip ci\]/i,
  /^chore: bump/i,
  /^(ci|build): (bump|release|build|tag|version)/i,
];

function isSkip(msg: string): boolean {
  const first = msg.split("\n")[0].trim();
  return SKIP_PATTERNS.some((re) => re.test(first));
}

function cleanTitle(msg: string): string {
  return msg
    .split("\n")[0]
    .replace(/^(feat|fix|chore|refactor|style|docs|test|perf|ci|build|revert)(\(.+?\))?:\s*/i, "")
    .trim();
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  draft: boolean;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ["User-\x41gent"]: "bitPOS-changelog/1.0",
  };
  if (process.env.GITHUB_WORKFLOW_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_WORKFLOW_TOKEN}`;
  }
  return headers;
}

function getLocalCommits(): ChangelogEntry[] {
  try {
    const out = execSync(
      `git -C "${REPO_ROOT}" log --format="%H|%s|%aI" -n 60`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();

    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, subject, date] = line.split("|");
        return { sha: sha.trim(), subject: subject?.trim() ?? "", date: date?.trim() ?? "" };
      })
      .filter(({ subject }) => !isSkip(subject))
      .map(({ sha, subject, date }) => ({
        id: `commit-${sha}`,
        type: "commit" as const,
        title: cleanTitle(subject),
        bullets: [],
        date,
        url: `${REPO_URL}/commit/${sha}`,
      }));
  } catch {
    return [];
  }
}

async function fetchNamedReleases(): Promise<ChangelogEntry[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/bitPOS-app/bitpos/releases?per_page=20`,
      { headers: githubHeaders() }
    );
    if (!res.ok) return [];
    const releases = (await res.json()) as GitHubRelease[];
    return releases
      .filter((r) => !r.draft && !/^build-\d+$/.test(r.tag_name))
      .map((r) => ({
        id: `release-${r.id}`,
        type: "release" as const,
        version: r.tag_name,
        title: r.name || r.tag_name,
        bullets: [],
        date: r.published_at,
        url: r.html_url,
      }));
  } catch {
    return [];
  }
}

async function fetchChangelog(): Promise<ChangelogEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const [commits, releases] = await Promise.all([
    Promise.resolve(getLocalCommits()),
    fetchNamedReleases(),
  ]);

  const releaseDates = new Set(releases.map((r) => r.date));
  const uniqueCommits = commits.filter((c) => !releaseDates.has(c.date));

  const all = [...releases, ...uniqueCommits].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  cache = { data: all, fetchedAt: Date.now() };
  return all;
}

router.get("/changelog", async (_req, res) => {
  try {
    const entries = await fetchChangelog();
    res.set("Cache-Control", "public, max-age=120");
    res.json({ entries });
  } catch (err) {
    res.status(502).json({ error: "Failed to load changelog." });
  }
});

export default router;
