import { Link } from "wouter";
import { Github } from "lucide-react";
import { version } from "@workspace/version";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <img src="/icon-192.png" alt="bitPOS" className="h-7 w-7 rounded-md" />
          <span className="text-xl font-bold tracking-tight text-white">
            bit<span className="text-primary">POS</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-white">Features</a>
          <Link href="/changelog" className="text-sm font-medium text-muted-foreground transition-colors hover:text-white">Changelog</Link>
          <Link href="/status" className="text-sm font-medium text-muted-foreground transition-colors hover:text-white">Status</Link>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/bitPOS-app/bitpos"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center h-9 w-9 rounded-md border border-white/10 text-muted-foreground transition-colors hover:text-white hover:border-white/20"
            aria-label="GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href="/app/"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            Open App
          </a>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-background/50 py-12 md:py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              <img src="/icon-192.png" alt="bitPOS" className="h-6 w-6 rounded-md" />
              <span className="text-lg font-bold tracking-tight text-white">
                bit<span className="text-primary">POS</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">A Bitcoin Lightning POS in your pocket. Accept payments, issue NFC cards, and run your business entirely on Bitcoin.</p>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Product</h3>
            <ul className="flex flex-col gap-2">
              <li><a href="#features" className="text-sm text-muted-foreground hover:text-primary transition-colors">Features</a></li>
              <li><Link href="/changelog" className="text-sm text-muted-foreground hover:text-primary transition-colors">Changelog</Link></li>
              <li><Link href="/status" className="text-sm text-muted-foreground hover:text-primary transition-colors">Status</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Legal</h3>
            <ul className="flex flex-col gap-2">
              <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Open Source</h3>
            <ul className="flex flex-col gap-2">
              <li>
                <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5" />
                  bitPOS-app/bitpos
                </a>
              </li>
              <li>
                <a href="https://github.com/bitPOS-app" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5" />
                  bitPOS-app org
                </a>
              </li>
              <li>
                <a href="/api/version" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Verify what's running
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} bitPOS. AGPL-3.0. Don't trust, verify.
          </p>
          <a
            href={`${version.repoUrl}/commit/${version.commit}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`built ${version.builtAt} from ${version.commit}`}
            className="group inline-flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
            data-testid="footer-version"
          >
            <span className="opacity-60 group-hover:opacity-100">verify:</span>
            <span className="text-white/80 group-hover:text-primary">{version.tag}</span>
            <span className="opacity-30">@</span>
            <span>{version.shortCommit}</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/30 selection:text-white">
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
