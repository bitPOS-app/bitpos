import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumPadProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  allowDecimal?: boolean;
}

const KEYS = ["1","2","3","4","5","6","7","8","9",".","0","del"];

export default function NumPad({ value, onChange, className, allowDecimal = false }: NumPadProps) {
  const handleKey = (key: string) => {
    if (key === "del") {
      onChange(value.slice(0, -1));
    } else if (key === ".") {
      if (!allowDecimal || value.includes(".")) return;
      onChange(value + ".");
    } else {
      if (value === "0" && key !== ".") {
        onChange(key);
      } else {
        onChange(value + key);
      }
    }
  };

  return (
    <div className={cn("w-full grid grid-cols-3 gap-2", className)}>
      {KEYS.map((key, idx) => {
        const isVisible = key !== "." || allowDecimal;
        if (!isVisible && key === ".") {
          return <div key={idx} />;
        }
        return (
          <button
            key={idx}
            type="button"
            data-testid={`num-key-${key}`}
            onClick={() => handleKey(key)}
            className={cn(
              "h-16 rounded-2xl flex items-center justify-center text-2xl font-semibold transition-all active:scale-95 select-none",
              key === "del"
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-card text-foreground hover:bg-card/80 border border-border"
            )}
          >
            {key === "del" ? <Delete className="w-5 h-5" /> : key}
          </button>
        );
      })}
    </div>
  );
}
