import { useId, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { version } from "@workspace/version";

/* ───────────────────────────────────────────────────────────────
   Shared bitaxe-style blueprint chrome + primitives for the
   bitPOS landing site. Charcoal #0B0C0E + bitcoin-orange #F7931A,
   Ubuntu + Ubuntu Mono. Mobile-first.
─────────────────────────────────────────────────────────────── */

export const ORANGE = "#F7931A";

/* shared tap-loop timing so card + lightning + screen stay in sync */
export const LOOP = 2.6;
export const LOOP_DELAY = 0.4;
export const loopTransition = {
  duration: LOOP,
  repeat: Infinity,
  repeatDelay: LOOP_DELAY,
  ease: "easeInOut" as const,
};

/* ── bolt glyph (official bitPOS logo bolt) ── */
export function Bolt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 180" className={className} fill="currentColor" aria-hidden="true">
      <path d="M103 22L52 98h46l-21 60 79-82H112l21-54z" />
    </svg>
  );
}

/* ── official bitPOS logo mark (matches favicon.svg / app icon) ── */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 180" className={className} fill="none" aria-hidden="true">
      <rect width="180" height="180" rx="36" fill="#0a0a0a" />
      <path d="M103 22L52 98h46l-21 60 79-82H112l21-54z" fill="#F7931A" />
    </svg>
  );
}

/* ── polished lightning strike: soft radial glow (rounded) + gradient bolt ── */
const FLASH_TIMES = [0, 0.4, 0.46, 0.54, 0.7];
export function LightningStrike({
  className = "",
  origin = "50% 30%",
  delay = 0,
}: { className?: string; origin?: string; delay?: number }) {
  const id = useId();
  const t = { ...loopTransition, times: FLASH_TIMES, delay };
  return (
    <div className={`pointer-events-none ${className}`} aria-hidden="true">
      {/* soft circular glow that is NOT clipped to a rectangle */}
      <motion.span
        className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: "210%",
          height: "210%",
          background:
            "radial-gradient(circle at center, rgba(247,147,26,0.55) 0%, rgba(247,147,26,0.2) 36%, transparent 70%)",
          filter: "blur(9px)",
        }}
        animate={{ opacity: [0, 0, 1, 0.1, 0], scale: [0.4, 0.4, 1.25, 1.05, 0.4] }}
        transition={t}
      />
      {/* bolt with a warm gradient and crisp light edge */}
      <motion.svg
        viewBox="0 0 60 90"
        className="relative h-full w-full"
        style={{ overflow: "visible", transformOrigin: origin }}
        fill="none"
        animate={{ opacity: [0, 0, 1, 0.18, 0], scale: [0.72, 0.72, 1.08, 1, 0.72] }}
        transition={t}
      >
        <defs>
          <linearGradient id={`${id}-bolt`} x1="0.2" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#FFF1CE" />
            <stop offset="48%" stopColor="#FFC25A" />
            <stop offset="100%" stopColor="#F7931A" />
          </linearGradient>
        </defs>
        <path
          d="M40 4 L16 44 L31 44 L20 86 L52 36 L35 36 L46 4 Z"
          fill={`url(#${id}-bolt)`}
          stroke="#FFF7E8"
          strokeWidth="1.1"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(255,228,150,0.9))" }}
        />
      </motion.svg>
    </div>
  );
}

/* ── corner registration ticks ── */
export function CornerTicks() {
  const base = "absolute w-3 h-3 border-[#F7931A]/60";
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t`} />
      <span className={`${base} right-2 top-2 border-r border-t`} />
      <span className={`${base} left-2 bottom-2 border-l border-b`} />
      <span className={`${base} right-2 bottom-2 border-r border-b`} />
    </>
  );
}

/* ── real-looking QR (crafted module pattern on a light panel) ── */
export function QRCode({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 25 25"
      shapeRendering="crispEdges"
      fill="#0B0C0E"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="7" height="1" /><rect x="12" y="0" width="1" height="1" /><rect x="15" y="0" width="2" height="1" /><rect x="18" y="0" width="7" height="1" />
      <rect x="0" y="1" width="1" height="1" /><rect x="6" y="1" width="1" height="1" /><rect x="9" y="1" width="3" height="1" /><rect x="18" y="1" width="1" height="1" /><rect x="24" y="1" width="1" height="1" />
      <rect x="0" y="2" width="1" height="1" /><rect x="2" y="2" width="3" height="1" /><rect x="6" y="2" width="1" height="1" /><rect x="8" y="2" width="1" height="1" /><rect x="12" y="2" width="3" height="1" /><rect x="18" y="2" width="1" height="1" /><rect x="20" y="2" width="3" height="1" /><rect x="24" y="2" width="1" height="1" />
      <rect x="0" y="3" width="1" height="1" /><rect x="2" y="3" width="3" height="1" /><rect x="6" y="3" width="1" height="1" /><rect x="10" y="3" width="1" height="1" /><rect x="13" y="3" width="4" height="1" /><rect x="18" y="3" width="1" height="1" /><rect x="20" y="3" width="3" height="1" /><rect x="24" y="3" width="1" height="1" />
      <rect x="0" y="4" width="1" height="1" /><rect x="2" y="4" width="3" height="1" /><rect x="6" y="4" width="1" height="1" /><rect x="8" y="4" width="1" height="1" /><rect x="10" y="4" width="1" height="1" /><rect x="12" y="4" width="2" height="1" /><rect x="18" y="4" width="1" height="1" /><rect x="20" y="4" width="3" height="1" /><rect x="24" y="4" width="1" height="1" />
      <rect x="0" y="5" width="1" height="1" /><rect x="6" y="5" width="1" height="1" /><rect x="9" y="5" width="1" height="1" /><rect x="12" y="5" width="2" height="1" /><rect x="15" y="5" width="1" height="1" /><rect x="18" y="5" width="1" height="1" /><rect x="24" y="5" width="1" height="1" />
      <rect x="0" y="6" width="7" height="1" /><rect x="8" y="6" width="1" height="1" /><rect x="10" y="6" width="1" height="1" /><rect x="12" y="6" width="1" height="1" /><rect x="14" y="6" width="1" height="1" /><rect x="16" y="6" width="1" height="1" /><rect x="18" y="6" width="7" height="1" />
      <rect x="11" y="7" width="1" height="1" /><rect x="13" y="7" width="1" height="1" /><rect x="15" y="7" width="1" height="1" />
      <rect x="0" y="8" width="1" height="1" /><rect x="3" y="8" width="1" height="1" /><rect x="6" y="8" width="1" height="1" /><rect x="9" y="8" width="1" height="1" /><rect x="11" y="8" width="4" height="1" /><rect x="16" y="8" width="1" height="1" /><rect x="18" y="8" width="4" height="1" /><rect x="23" y="8" width="2" height="1" />
      <rect x="1" y="9" width="1" height="1" /><rect x="3" y="9" width="3" height="1" /><rect x="7" y="9" width="1" height="1" /><rect x="9" y="9" width="1" height="1" /><rect x="11" y="9" width="3" height="1" /><rect x="17" y="9" width="1" height="1" /><rect x="19" y="9" width="3" height="1" /><rect x="24" y="9" width="1" height="1" />
      <rect x="0" y="10" width="1" height="1" /><rect x="2" y="10" width="1" height="1" /><rect x="4" y="10" width="3" height="1" /><rect x="8" y="10" width="1" height="1" /><rect x="14" y="10" width="3" height="1" /><rect x="19" y="10" width="1" height="1" />
      <rect x="1" y="11" width="3" height="1" /><rect x="7" y="11" width="1" height="1" /><rect x="10" y="11" width="3" height="1" /><rect x="14" y="11" width="1" height="1" /><rect x="16" y="11" width="1" height="1" /><rect x="19" y="11" width="2" height="1" /><rect x="24" y="11" width="1" height="1" />
      <rect x="0" y="12" width="2" height="1" /><rect x="6" y="12" width="1" height="1" /><rect x="8" y="12" width="2" height="1" /><rect x="11" y="12" width="2" height="1" /><rect x="14" y="12" width="1" height="1" /><rect x="16" y="12" width="1" height="1" /><rect x="19" y="12" width="1" height="1" /><rect x="21" y="12" width="1" height="1" /><rect x="23" y="12" width="2" height="1" />
      <rect x="2" y="13" width="2" height="1" /><rect x="8" y="13" width="5" height="1" /><rect x="20" y="13" width="2" height="1" /><rect x="23" y="13" width="2" height="1" />
      <rect x="2" y="14" width="1" height="1" /><rect x="4" y="14" width="1" height="1" /><rect x="6" y="14" width="1" height="1" /><rect x="9" y="14" width="1" height="1" /><rect x="12" y="14" width="1" height="1" /><rect x="15" y="14" width="1" height="1" /><rect x="18" y="14" width="2" height="1" /><rect x="21" y="14" width="1" height="1" /><rect x="23" y="14" width="2" height="1" />
      <rect x="3" y="15" width="1" height="1" /><rect x="10" y="15" width="1" height="1" /><rect x="12" y="15" width="1" height="1" /><rect x="15" y="15" width="2" height="1" /><rect x="19" y="15" width="1" height="1" /><rect x="22" y="15" width="1" height="1" /><rect x="24" y="15" width="1" height="1" />
      <rect x="1" y="16" width="2" height="1" /><rect x="4" y="16" width="8" height="1" /><rect x="13" y="16" width="2" height="1" /><rect x="16" y="16" width="8" height="1" />
      <rect x="8" y="17" width="1" height="1" /><rect x="10" y="17" width="4" height="1" /><rect x="16" y="17" width="1" height="1" /><rect x="20" y="17" width="1" height="1" /><rect x="22" y="17" width="2" height="1" />
      <rect x="0" y="18" width="7" height="1" /><rect x="10" y="18" width="1" height="1" /><rect x="12" y="18" width="3" height="1" /><rect x="16" y="18" width="1" height="1" /><rect x="18" y="18" width="1" height="1" /><rect x="20" y="18" width="1" height="1" /><rect x="22" y="18" width="1" height="1" />
      <rect x="0" y="19" width="1" height="1" /><rect x="6" y="19" width="1" height="1" /><rect x="9" y="19" width="1" height="1" /><rect x="14" y="19" width="3" height="1" /><rect x="20" y="19" width="1" height="1" /><rect x="22" y="19" width="1" height="1" /><rect x="24" y="19" width="1" height="1" />
      <rect x="0" y="20" width="1" height="1" /><rect x="2" y="20" width="3" height="1" /><rect x="6" y="20" width="1" height="1" /><rect x="12" y="20" width="2" height="1" /><rect x="15" y="20" width="6" height="1" /><rect x="22" y="20" width="1" height="1" />
      <rect x="0" y="21" width="1" height="1" /><rect x="2" y="21" width="3" height="1" /><rect x="6" y="21" width="1" height="1" /><rect x="8" y="21" width="1" height="1" /><rect x="10" y="21" width="2" height="1" /><rect x="13" y="21" width="4" height="1" /><rect x="22" y="21" width="1" height="1" /><rect x="24" y="21" width="1" height="1" />
      <rect x="0" y="22" width="1" height="1" /><rect x="2" y="22" width="3" height="1" /><rect x="6" y="22" width="1" height="1" /><rect x="11" y="22" width="1" height="1" /><rect x="13" y="22" width="1" height="1" /><rect x="16" y="22" width="8" height="1" />
      <rect x="0" y="23" width="1" height="1" /><rect x="6" y="23" width="1" height="1" /><rect x="8" y="23" width="1" height="1" /><rect x="10" y="23" width="2" height="1" /><rect x="14" y="23" width="1" height="1" /><rect x="18" y="23" width="2" height="1" />
      <rect x="0" y="24" width="7" height="1" /><rect x="8" y="24" width="1" height="1" /><rect x="12" y="24" width="1" height="1" /><rect x="16" y="24" width="3" height="1" /><rect x="20" y="24" width="5" height="1" />
      {/* finder patterns */}
      <rect x="1" y="1" width="5" height="5" fill="#f3ebe3" /><rect x="19" y="1" width="5" height="5" fill="#f3ebe3" /><rect x="1" y="19" width="5" height="5" fill="#f3ebe3" />
      <rect x="2" y="2" width="3" height="3" /><rect x="20" y="2" width="3" height="3" /><rect x="2" y="20" width="3" height="3" />
      <rect x="17" y="17" width="3" height="3" fill="#f3ebe3" /><rect x="18" y="18" width="1" height="1" />
    </svg>
  );
}

/* ── ascii data-field texture (decorative, desktop only) ── */
export function AsciiField({ rows, cols, className = "" }: { rows: number; cols: number; className?: string }) {
  const glyphs = ["·", "0", "1", "+", "#", "-", "·", "0", "+", "·"];
  const total = rows * cols;
  const [cells, setCells] = useState<number[]>(() =>
    Array.from({ length: total }, (_, i) => (Math.floor(i / cols) * 7 + (i % cols) * 3) % glyphs.length),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setCells((prev) => {
        const next = prev.slice();
        const flips = Math.ceil(total * 0.04);
        for (let f = 0; f < flips; f++) {
          const idx = Math.floor(Math.random() * total);
          next[idx] = (next[idx] + 1) % glyphs.length;
        }
        return next;
      });
    }, 90);
    return () => clearInterval(id);
  }, [total]);

  const lines = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => glyphs[cells[r * cols + c]]).join(" "),
  );

  return (
    <pre
      aria-hidden="true"
      className={`pointer-events-none select-none font-['Ubuntu_Mono'] text-[9px] leading-[1.45] tracking-[0.12em] ${className}`}
      style={{ color: "rgba(247,147,26,0.14)" }}
    >
      {lines.join("\n")}
    </pre>
  );
}

/* ── annotation with leader line (desktop only) ── */
export function Annotation({ label, className = "", align = "left" }: { label: string; className?: string; align?: "left" | "right" }) {
  return (
    <div className={`absolute hidden lg:flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""} ${className}`}>
      <span className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-[0.18em] text-[#F7931A]/70 whitespace-nowrap">{label}</span>
      <span className="h-px w-10 bg-[#F7931A]/30" />
    </div>
  );
}

/* ── blueprint grid background + top rail ── */
export function BlueprintBg() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.6]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(247,147,26,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(247,147,26,0.05) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none absolute left-0 right-0 top-[68px] z-0 hidden border-t border-dashed border-[#F7931A]/15 sm:block" />
    </>
  );
}

/* ── nav link ── */
function NavItem({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={`font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] transition-colors hover:text-[#F7931A] ${
        active ? "text-[#F7931A]" : "text-white/60"
      }`}
    >
      [ {children} ]
    </span>
  );
}

/* ── shared blueprint nav ── */
export function BlueprintNav() {
  const [location] = useLocation();
  return (
    <header className="relative z-30 mx-auto max-w-[1180px] px-5 py-4 sm:px-8">
      {/* top row: logo + (desktop nav) + launch */}
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-['Ubuntu'] text-[20px] font-bold">
            <span className="text-white">bit</span><span className="text-[#F7931A]">POS</span>
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-5 lg:flex">
          <Link href="/features/app"><NavItem active={location === "/features/app"}>The App</NavItem></Link>
          <Link href="/features/box"><NavItem active={location === "/features/box"}>The Box</NavItem></Link>
          <Link href="/features/cards"><NavItem active={location === "/features/cards"}>Bolt Cards</NavItem></Link>
          <a href="https://github.com/bitPOS-app" target="_blank" rel="noopener noreferrer"><NavItem>Source</NavItem></a>
        </nav>

        <span className="flex-1" />

        <a
          href="https://bitpos.app/app/"
          className="flex items-center gap-1.5 rounded-md bg-[#F7931A] px-4 py-2 font-['Ubuntu'] text-[13px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
        >
          Launch <span className="font-['Ubuntu_Mono']">&raquo;</span>
        </a>
      </div>

      {/* mobile nav row — visible below lg, single line */}
      <nav className="flex items-center justify-between pt-3 lg:hidden">
        {(
          [
            { href: "/features/app",  label: "THE APP",    active: location === "/features/app" },
            { href: "/features/box",  label: "THE BOX",    active: location === "/features/box" },
            { href: "/features/cards",label: "BOLT CARDS", active: location === "/features/cards" },
            { href: "https://github.com/bitPOS-app", label: "SOURCE", active: false, external: true },
          ] as { href: string; label: string; active: boolean; external?: boolean }[]
        ).map(({ href, label, active, external }) => {
          const cls = `whitespace-nowrap font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.1em] transition-colors hover:text-[#F7931A] ${active ? "text-[#F7931A]" : "text-white/55"}`;
          const text = `[ ${label} ]`;
          return external
            ? <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{text}</a>
            : <Link key={label} href={href} className={cls}>{text}</Link>;
        })}
      </nav>
    </header>
  );
}

/* ── shared blueprint footer ── */
export function BlueprintFooter() {
  const year = new Date().getFullYear();
  const lnk = "transition-colors hover:text-[#F7931A]";
  return (
    <footer className="relative z-20 border-t border-dashed border-[#F7931A]/20">
      <div className="mx-auto max-w-[1180px] px-5 py-6 font-['Ubuntu_Mono'] text-[11px] text-white/40 sm:px-8">

        {/* row 1: copyright + version */}
        <div className="flex items-center justify-between">
          <span className="text-white/55">&copy; {year} bitPOS</span>
          <a
            href={`${version.repoUrl}/commit/${version.commit}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`built ${version.builtAt} from ${version.commit}`}
            data-testid="footer-version"
            className={lnk}
          >
            {version.tag}@{version.shortCommit}
          </a>
        </div>

        {/* row 2: nav links */}
        <div className="mt-3 flex flex-wrap justify-between gap-y-2">
          <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer" className={lnk}>GitHub</a>
          <Link href="/changelog" className={lnk}>Changelog</Link>
          <Link href="/comparison" className={lnk}>Card vs Credit</Link>
          <Link href="/status" className={lnk}>Status</Link>
          <Link href="/privacy" className={lnk}>Privacy</Link>
          <Link href="/terms" className={lnk}>Terms</Link>
        </div>

        {/* row 3: tagline */}
        <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/25">
          Open source &middot; AGPL-3.0 &middot; Custodial wallet, non-custodial sweep
        </p>

      </div>
    </footer>
  );
}

/* ── full-page shell: background + nav + content + footer ── */
export function BlueprintShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bp-shell relative min-h-[100dvh] overflow-hidden bg-[#0B0C0E] text-white font-['Ubuntu']">
      <BlueprintBg />
      <BlueprintNav />
      {children}
      <BlueprintFooter />
    </div>
  );
}

/* ───────────────────── section primitives ───────────────────── */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-[#F7931A]/80">
      <span className="h-1.5 w-1.5 rounded-full bg-[#F7931A]" /> {children}
    </span>
  );
}

export function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative z-20 border-t border-dashed border-[#F7931A]/20 ${className}`}>
      <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-14">{children}</div>
    </section>
  );
}

export function SectionHeading({ tag, title }: { tag: string; title: string }) {
  return (
    <>
      <span className="font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-[#F7931A]">[ {tag} ]</span>
      <h2 className="mt-3 max-w-2xl font-['Ubuntu'] text-[26px] font-bold leading-[1.1] text-white sm:text-[32px]">{title}</h2>
    </>
  );
}

export function FeatureBullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 border-t border-dashed border-[#F7931A]/15 pt-4">
          <span className="mt-0.5 font-['Ubuntu_Mono'] text-[12px] text-[#F7931A]">+</span>
          <span className="font-['Ubuntu'] text-[14px] leading-relaxed text-white/65">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function TagRow({ tags }: { tags: string[] }) {
  return (
    <div className="mt-8 flex flex-wrap gap-2.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-md border border-[#F7931A]/30 px-3 py-1.5 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.16em] text-white/55"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function FinalCTA({
  title,
  lede,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  note,
}: {
  title: string;
  lede: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  note?: React.ReactNode;
}) {
  return (
    <section className="relative z-20 border-t border-dashed border-[#F7931A]/20">
      <div className="mx-auto max-w-[1180px] px-5 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="mx-auto max-w-2xl font-['Ubuntu'] text-[28px] font-bold leading-[1.1] text-white sm:text-[40px]">{title}</h2>
        <p className="mx-auto mt-4 max-w-md font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">{lede}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={ctaHref}
            className="flex items-center gap-2 rounded-md bg-[#F7931A] px-6 py-3 font-['Ubuntu'] text-[14px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
          >
            {ctaLabel} <span className="font-['Ubuntu_Mono']">&raquo;</span>
          </a>
          {secondaryLabel && secondaryHref && (
            <a
              href={secondaryHref}
              className="font-['Ubuntu'] text-[14px] text-white/55 transition-colors hover:text-[#F7931A]"
            >
              {secondaryLabel} &rarr;
            </a>
          )}
        </div>
        {note && (
          <p className="mt-5 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] text-white/40">{note}</p>
        )}
      </div>
    </section>
  );
}
