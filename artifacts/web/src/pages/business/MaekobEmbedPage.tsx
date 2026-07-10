import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function MaekobEmbedPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmbedToken = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/embed-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      const data = await res.json() as { embedUrl: string };
      setEmbedUrl(data.embedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load card shop");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEmbedToken();
  }, [fetchEmbedToken]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== "object" || event.data === null) return;
      const { type } = event.data as { type?: string };
      if (type === "maekob:order_complete") {
        toast({ title: "Order placed", description: "Your card order has been received." });
      } else if (type === "maekob:design_saved") {
        toast({ title: "Design saved" });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={fetchEmbedToken}
          className="text-xs text-primary underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!embedUrl) return null;

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 56px)" }}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Card Shop"
        className="w-full flex-1 border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="camera; clipboard-write"
      />
    </div>
  );
}
