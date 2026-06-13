import { Link } from "wouter";
import { version } from "@workspace/version";

export function Nav() {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-in">
        <Link href="/" className="lp-logo">
          <span className="lp-bolt">
            <svg viewBox="0 0 24 24">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
          </span>
          <span>
            <span className="bit">bit</span><span className="pos">POS</span>
          </span>
        </Link>

        <span className="nav-spacer" />

        <a
          href="https://github.com/bitPOS-app/bitpos"
          target="_blank"
          rel="noopener noreferrer"
          className="ghost-btn"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
          </svg>
        </a>

        <a href="https://bitpos.app/app/" className="cta-btn">
          Launch App
        </a>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="lp-footer">
      <div className="wrap">
        <div className="foot-in">
          <Link href="/" className="lp-logo" style={{ fontSize: "19px" }}>
            <span className="lp-bolt" style={{ width: "26px", height: "26px", borderRadius: "8px" }}>
              <svg viewBox="0 0 24 24" style={{ width: "13px", height: "13px", fill: "var(--orange)" }}>
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
            </span>
            <span>
              <span className="bit">bit</span><span className="pos">POS</span>
            </span>
          </Link>

          <div className="foot-links">
            <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link href="/changelog">Changelog</Link>
            <Link href="/status">Status</Link>
            <Link href="/comparison">Bolt Card vs Credit Card</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>

        <div className="foot-bottom">
          <span>&copy; {new Date().getFullYear()} bitPOS.</span>
          <a
            href={`${version.repoUrl}/commit/${version.commit}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`built ${version.builtAt} from ${version.commit}`}
            data-testid="footer-version"
          >
            {version.tag}@{version.shortCommit}
          </a>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <Nav />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}
