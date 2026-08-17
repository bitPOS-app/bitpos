import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { BlueprintShell, Eyebrow } from "@/components/blueprint";

interface ChangelogEntry {
  id: string;
  type: "release" | "commit";
  version?: string;
  title: string;
  bullets: string[];
  date: string;
  url: string;
}

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const date = new Date(entry.date);
  const isRelease = entry.type === "release";

  return (
    <div className="relative pl-8 sm:pl-10">
      {/* timeline node */}
      <span
        className={`absolute left-0 top-1.5 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full border ${
          isRelease
            ? "border-[#F7931A] bg-[#F7931A]/15"
            : "border-[#F7931A]/30 bg-[#0B0C0E]"
        }`}
      >
        <span
          className={`rounded-full ${
            isRelease ? "h-2 w-2 bg-[#F7931A]" : "h-1.5 w-1.5 bg-[#F7931A]/50"
          }`}
        />
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {isRelease && entry.version && (
          <span className="rounded-md border border-[#F7931A]/40 bg-[#F7931A]/10 px-2 py-0.5 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.16em] text-[#F7931A]">
            {entry.version}
          </span>
        )}
        <span
          className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-white/40"
          title={format(date, "PPpp")}
        >
          {formatDistanceToNow(date, { addSuffix: true })}
        </span>
      </div>

      <h3
        className={`mt-2 font-['Ubuntu'] font-bold text-white ${
          isRelease ? "text-[18px]" : "text-[15px] text-white/90"
        }`}
      >
        {entry.title}
      </h3>

      {entry.bullets && entry.bullets.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {entry.bullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 font-['Ubuntu_Mono'] text-[12px] text-[#F7931A]">+</span>
              <span className="font-['Ubuntu'] text-[14px] leading-relaxed text-white/65">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.16em] text-white/35 transition-colors hover:text-[#F7931A]"
      >
        View commit &raquo;
      </a>
    </div>
  );
}

function SkeletonRow({ isRelease = false }: { isRelease?: boolean }) {
  return (
    <div className="relative animate-pulse pl-8 sm:pl-10">
      <span className="absolute left-0 top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border border-[#F7931A]/20 bg-[#0B0C0E]" />
      <div className="flex items-center gap-3">
        {isRelease && <div className="h-4 w-14 rounded-md bg-[#F7931A]/10" />}
        <div className="h-3 w-24 rounded bg-white/5" />
      </div>
      <div className="mt-2 h-5 w-3/4 rounded bg-white/5" />
      {isRelease && <div className="mt-2 h-4 w-full rounded bg-white/5" />}
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
    <BlueprintShell>
      <main className="relative z-20 mx-auto max-w-[760px] px-5 pb-20 pt-10 sm:px-8">
        <Eyebrow>Changelog</Eyebrow>
        <h1
          className="mt-3 font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em] text-white"
          style={{ fontSize: "clamp(38px, 7vw, 64px)" }}
        >
          WHAT IS NEW
        </h1>
        <p className="mt-4 max-w-md font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          Updates and improvements to bitPOS, pulled straight from the source.
        </p>

        <div className="relative mt-12 space-y-9 border-l border-dashed border-[#F7931A]/25 pl-px">
          {isPending && (
            <>
              <SkeletonRow isRelease />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {isError && (
            <div className="relative pl-8 sm:pl-10">
              <span className="absolute left-0 top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border border-[#F7931A]/30 bg-[#0B0C0E]" />
              <p className="font-['Ubuntu'] text-[14px] text-white/60">
                Could not load the changelog from GitHub.{" "}
                <a
                  href="https://github.com/bitPOS-app/bitpos/commits/main"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F7931A] transition-colors hover:underline"
                >
                  View on GitHub
                </a>
              </p>
            </div>
          )}

          {!isPending && !isError && entries.length === 0 && (
            <div className="relative pl-8 font-['Ubuntu'] text-[14px] text-white/50 sm:pl-10">
              No entries found.
            </div>
          )}

          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>

        {!isPending && entries.length > 0 && (
          <div className="mt-10">
            <a
              href="https://github.com/bitPOS-app/bitpos/commits/main"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] text-white/40 transition-colors hover:text-[#F7931A]"
            >
              Full history on GitHub &raquo;
            </a>
          </div>
        )}
      </main>
    </BlueprintShell>
  );
}
