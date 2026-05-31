import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, GitCommit, Loader2, ExternalLink } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface ChangelogEntry {
  id: string;
  type: "release" | "commit";
  version?: string;
  title: string;
  bullets: string[];
  date: string;
  url: string;
}

function EntryIcon({ type }: { type: ChangelogEntry["type"] }) {
  if (type === "release") {
    return (
      <div className="absolute -left-3 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-primary/40">
        <CheckCircle2 className="h-4 w-4 text-primary" />
      </div>
    );
  }
  return (
    <div className="absolute -left-3 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-white/10">
      <GitCommit className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}

function EntryCard({ entry }: { entry: ChangelogEntry }) {
  const date = new Date(entry.date);
  const isRelease = entry.type === "release";

  return (
    <div className="relative pl-8 md:pl-12">
      <EntryIcon type={entry.type} />

      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-2">
        {isRelease && entry.version && (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {entry.version}
          </span>
        )}
        <span className="text-sm font-mono text-muted-foreground" title={format(date, "PPpp")}>
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      </div>

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold mb-2 ${isRelease ? "text-xl" : "text-base text-white/90"}`}>
            {entry.title}
          </h3>
          {entry.bullets && entry.bullets.length > 0 && (
            <ul className="space-y-1">
              {entry.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary/60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-white transition-colors"
          aria-label="View on GitHub"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function SkeletonEntry({ isRelease = false }: { isRelease?: boolean }) {
  return (
    <div className="relative pl-8 md:pl-12 animate-pulse">
      <div className="absolute -left-3 top-1 h-6 w-6 rounded-full bg-white/5 border border-white/10" />
      <div className="flex items-baseline gap-2 mb-2">
        {isRelease && <div className="h-5 w-16 rounded-full bg-primary/10" />}
        <div className="h-4 w-24 rounded bg-white/5" />
      </div>
      <div className={`h-${isRelease ? "6" : "5"} w-3/4 rounded bg-white/5 mb-1`} />
      {isRelease && <div className="h-4 w-full rounded bg-white/5" />}
    </div>
  );
}

export default function Changelog() {
  const { data, isPending, isError } = useQuery<{ entries: ChangelogEntry[] }>({
    queryKey: ["changelog"],
    queryFn: async () => {
      const res = await fetch("/api/changelog");
      if (!res.ok) throw new Error("Failed to load changelog");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const entries = data?.entries ?? [];

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
      <div className="mb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Changelog</h1>
        <p className="text-xl text-muted-foreground">New updates and improvements to bitPOS.</p>
      </div>

      <div className="relative border-l border-white/10 ml-4 md:ml-8 space-y-10 pb-12">
        {isPending && (
          <>
            <SkeletonEntry isRelease />
            <SkeletonEntry />
            <SkeletonEntry />
            <SkeletonEntry />
            <SkeletonEntry />
          </>
        )}

        {isError && (
          <div className="relative pl-8 md:pl-12">
            <div className="absolute -left-3 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-white/10">
              <Circle className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Could not load changelog from GitHub.{" "}
              <a
                href="https://github.com/bitPOS-app/bitpos/commits/main"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                View on GitHub
              </a>
            </p>
          </div>
        )}

        {!isPending && !isError && entries.length === 0 && (
          <div className="relative pl-8 md:pl-12 text-muted-foreground text-sm">
            No entries found.
          </div>
        )}

        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {!isPending && entries.length > 0 && (
        <div className="mt-4 text-center">
          <a
            href="https://github.com/bitPOS-app/bitpos/commits/main"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Full history on GitHub
          </a>
        </div>
      )}
    </div>
  );
}
