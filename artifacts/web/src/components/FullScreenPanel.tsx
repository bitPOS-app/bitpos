import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface FullScreenPanelProps {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  className?: string;
  noPadding?: boolean;
}

export default function FullScreenPanel({ title, children, onBack, className, noPadding }: FullScreenPanelProps) {
  const navigate = useNavigate();

  const handleBack = onBack ?? (() => navigate("/dashboard"));

  return (
    <div
      className={cn("fixed inset-0 z-50 bg-background flex flex-col slide-in-right", className)}
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
    >
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border shrink-0">
        <button
          type="button"
          data-testid="btn-back"
          onClick={handleBack}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </header>
      <div className={cn("flex-1 overflow-y-auto", !noPadding && "p-4")}>
        {children}
      </div>
    </div>
  );
}
