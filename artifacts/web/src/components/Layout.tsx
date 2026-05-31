import { Link } from "react-router-dom";
import { Wallet, CreditCard, Briefcase, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { version } from "@workspace/version";

type Tab = "wallet" | "card" | "business" | "settings";

const tabs: { id: Tab; label: string; icon: typeof Wallet; href: string }[] = [
  { id: "wallet", label: "Wallet", icon: Wallet, href: "/dashboard" },
  { id: "card", label: "Card", icon: CreditCard, href: "/bolt-card" },
  { id: "business", label: "Business", icon: Briefcase, href: "/business" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

interface LayoutProps {
  children: React.ReactNode;
  active: Tab;
}

export default function Layout({ children, active }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="px-6 py-8">
          <span className="text-xl font-bold tracking-tight text-foreground">
            bit<span className="text-primary">POS</span>
          </span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <Link
                key={tab.id}
                to={tab.href}
                data-testid={`nav-${tab.id}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <a
          href={`${version.repoUrl}/commit/${version.commit}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`built ${version.builtAt} from ${version.commit} \u2014 click to verify on GitHub`}
          data-testid="sidebar-version"
          className="mx-3 mb-4 px-4 py-2 rounded-lg text-[10px] font-mono text-muted-foreground/60 hover:text-primary hover:bg-muted transition-colors leading-tight"
        >
          <div className="opacity-60">verify, don't trust</div>
          <div className="text-foreground/80 mt-0.5">{version.tag} @ {version.shortCommit}</div>
        </a>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {children}
        </main>

        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border z-40"
          style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-around px-2 pt-2 pb-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.id;
              return (
                <Link
                  key={tab.id}
                  to={tab.href}
                  data-testid={`tab-${tab.id}`}
                  className={cn(
                    "flex flex-col items-center gap-1 px-4 py-1 rounded-lg min-w-[48px] min-h-[48px] justify-center transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                  <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
