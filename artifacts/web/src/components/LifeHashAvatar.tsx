import { useEffect, useState } from "react";
import { generateWithAbort, ELifeHashVersion } from "lifehashjs";
import { cn } from "@/lib/utils";

interface Props {
  input: string;
  size?: number;
  className?: string;
  fallback?: string;
}

export function LifeHashAvatar({ input, size = 48, className, fallback }: Props) {
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    if (!input) return;
    const controller = new AbortController();
    generateWithAbort(input, {
      version: ELifeHashVersion.version2,
      signal: controller.signal,
    })
      .then((result) => { if (result?.dataUri) setDataUri(result.dataUri); })
      .catch((err) => { if (err?.name !== "AbortError") console.error("LifeHash error:", err); });
    return () => controller.abort();
  }, [input]);

  const initials = (fallback ?? input)[0]?.toUpperCase() ?? "?";

  if (!dataUri) {
    return (
      <div
        className={cn("rounded-2xl bg-primary/10 flex items-center justify-center shrink-0", className)}
        style={{ width: size, height: size }}
      >
        <span className="text-lg font-bold text-primary">{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={dataUri}
      alt={`avatar for ${input}`}
      width={size}
      height={size}
      className={cn("rounded-2xl shrink-0 object-cover", className)}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}
