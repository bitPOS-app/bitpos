import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Bolt,
  CornerTicks,
  QRCode,
  AsciiField,
  Annotation,
  BlueprintShell,
  LightningStrike,
  loopTransition,
} from "@/components/blueprint";

/* ───────────────────────────────────────────────────────────────
   bitPOS landing — technical blueprint / schematic infographic
   (bitaxe.org-style). Charcoal #0B0C0E + bitcoin-orange #F7931A,
   Ubuntu + Ubuntu Mono. Mobile-first, single glance.
─────────────────────────────────────────────────────────────── */

/* ── the animated device + tapping Bolt Card + lightning strike ── */
function BlueprintDevice() {
  return (
    <div className="relative mx-auto w-[300px] h-[440px] sm:w-[320px] sm:h-[470px]">
      {/* NFC arcs (right edge), flash on tap */}
      <motion.svg
        className="absolute -right-3 top-[40%] w-16 h-24 text-[#F7931A]"
        viewBox="0 0 40 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        aria-hidden="true"
        animate={{ opacity: [0.25, 0.25, 1, 0.25, 0.25] }}
        transition={{ ...loopTransition, times: [0, 0.4, 0.48, 0.6, 1] }}
      >
        <path d="M8 12 Q22 35 8 58" />
        <path d="M16 6 Q36 35 16 64" opacity="0.7" />
      </motion.svg>

      {/* device body */}
      <div className="relative w-full h-full rounded-[34px] border border-[#F7931A]/55 bg-[#0B0C0E]/70 p-3.5 flex flex-col">
        <CornerTicks />

        {/* status bar */}
        <div className="flex justify-between items-center px-1.5 pb-2.5 font-['Ubuntu_Mono'] text-[9px] uppercase tracking-[0.18em] text-[#F7931A]/80">
          <span>bitPOS / POS</span>
          <span>0:58</span>
        </div>

        {/* mono readout */}
        <div className="mx-1 rounded-2xl border border-[#F7931A]/25 bg-black/30 px-3.5 py-3 font-['Ubuntu_Mono'] text-[11px] leading-[1.7] text-[#F7931A]/90">
          <div><span className="text-white/40">AMT</span>&nbsp;&nbsp;4,200 sats</div>
          <div><span className="text-white/40">FIAT</span>&nbsp;~ $2.94 USD</div>
          <div><span className="text-white/40">NET</span>&nbsp;&nbsp;lightning</div>
          <div><span className="text-white/40">INV</span>&nbsp;&nbsp;lnbc1p4k9x2...</div>
        </div>

        {/* QR panel (real-looking, light) */}
        <div className="flex-1 grid place-items-center">
          <div className="relative w-[150px] h-[150px] rounded-xl bg-[#f3ebe3] p-2.5 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.7)]">
            <QRCode className="w-full h-full" />
            <span className="absolute -left-1 -top-1 w-3 h-3 border-l border-t border-[#F7931A]" />
            <span className="absolute -right-1 -top-1 w-3 h-3 border-r border-t border-[#F7931A]" />
            <span className="absolute -left-1 -bottom-1 w-3 h-3 border-l border-b border-[#F7931A]" />
            <span className="absolute -right-1 -bottom-1 w-3 h-3 border-r border-b border-[#F7931A]" />
          </div>
        </div>

        {/* status line: AWAITING TAP <-> PAID */}
        <div className="relative h-6 mt-1 grid place-items-center font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.22em]">
          <motion.span
            className="absolute flex items-center gap-2 text-[#F7931A]/80"
            animate={{ opacity: [1, 1, 0, 0, 1] }}
            transition={{ ...loopTransition, times: [0, 0.42, 0.48, 0.82, 0.9] }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F7931A]" /> Awaiting tap
          </motion.span>
          <motion.span
            className="absolute flex items-center gap-2 text-[#39d98a]"
            animate={{ opacity: [0, 0, 1, 1, 0] }}
            transition={{ ...loopTransition, times: [0, 0.46, 0.52, 0.8, 0.88] }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#39d98a]" /> Paid 4,200 sats
          </motion.span>
        </div>

        {/* speaker line */}
        <div className="mx-auto mt-1.5 h-1 w-12 rounded-full bg-[#F7931A]/25" />
      </div>

      {/* lightning strike — flashes at the moment of tap */}
      <LightningStrike className="absolute right-[6%] top-[34%] w-20 h-28 z-20" origin="70% 30%" />

      {/* tapping Bolt Card */}
      <motion.div
        className="absolute z-10 right-[-12%] top-[26%] w-[176px] h-[112px] rounded-2xl border border-[#F7931A]/60 bg-gradient-to-br from-[#1a1206] to-[#0B0C0E] shadow-[0_20px_40px_-18px_rgba(0,0,0,0.8)]"
        animate={{ x: [54, 0, 0, 54], y: [-52, 0, 0, -52], rotate: [-18, -6, -6, -18] }}
        transition={{ ...loopTransition, times: [0, 0.42, 0.56, 1] }}
      >
        <div className="absolute left-3 top-3 flex items-center gap-1.5 font-['Ubuntu'] font-bold text-[13px]">
          <span className="text-white">bit</span><span className="text-[#F7931A]">POS</span>
        </div>
        <Bolt className="absolute right-3 top-3 w-4 h-4 text-[#F7931A]" />
        <div className="absolute left-3 bottom-3 font-['Ubuntu_Mono'] text-[8px] uppercase tracking-[0.2em] text-white/45">
          Bolt Card
        </div>
        <div className="absolute right-3 bottom-3 h-5 w-7 rounded-sm border border-[#F7931A]/40 bg-[#F7931A]/10" />
      </motion.div>
    </div>
  );
}

/* ── product spec column ── */
function SpecCol({ tag, title, desc, href, external }: { tag: string; title: string; desc: string; href: string; external?: boolean }) {
  const body = (
    <div className="group flex h-full flex-col gap-2 border-t border-dashed border-[#F7931A]/25 px-1 pt-5 md:border-t-0 md:border-l md:pl-6 md:pt-1">
      <span className="font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-[#F7931A]">[ {tag} ]</span>
      <h3 className="font-['Ubuntu'] text-[17px] font-bold text-white">{title}</h3>
      <p className="font-['Ubuntu'] text-[13px] leading-relaxed text-white/55">{desc}</p>
      <span className="mt-1 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.16em] text-white/40 transition-colors group-hover:text-[#F7931A]">
        Learn more &raquo;
      </span>
    </div>
  );
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{body}</a>;
  }
  return <Link href={href}>{body}</Link>;
}

export default function Home() {
  return (
    <BlueprintShell>
      {/* ===== HERO ===== */}
      <main className="relative z-20 mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:min-h-[calc(100dvh-220px)] lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:gap-6 lg:pb-10 lg:pt-4">
        {/* LEFT: blueprint device (first on desktop, second on mobile) */}
        <div className="relative order-2 lg:order-1 lg:h-full">
          {/* ascii fields + annotations (desktop only) */}
          <AsciiField rows={16} cols={12} className="absolute left-0 top-[6%] hidden lg:block" />
          <AsciiField rows={8} cols={18} className="absolute left-0 bottom-[2%] hidden lg:block" />
          <Annotation label="Lightning invoice" className="left-[6%] top-[2%]" />
          <Annotation label="NTAG424 / AES-128" className="right-[0%] bottom-[30%]" align="right" />
          <Annotation label="Settles < 1s" className="left-[8%] bottom-[6%]" />

          <div className="relative grid h-full place-items-center py-4">
            <BlueprintDevice />
          </div>
        </div>

        {/* RIGHT: headline + copy + CTAs */}
        <div className="order-1 lg:order-2">
          <h1 className="font-['Ubuntu'] font-bold leading-[0.92] tracking-[-0.02em]" style={{ fontSize: "clamp(46px, 9vw, 104px)" }}>
            <span className="block text-white">ACCEPT</span>
            <span className="my-1 inline-block border-2 border-[#F7931A] px-3 py-0.5 text-[#F7931A]">BITCOIN</span>
            <span className="flex items-end gap-3 text-white">
              ANYWHERE
              <span className="text-[#F7931A]" style={{ fontSize: "clamp(34px, 7vw, 80px)" }}>///</span>
            </span>
          </h1>

          <p className="mt-6 max-w-md font-['Ubuntu'] text-[15px] leading-relaxed text-white/65 sm:text-[16px]">
            The Bitcoin point of sale in your pocket. Open an account, charge in sats, and
            settle over Lightning in under a second. No installs, no hardware, no bank, no
            chargebacks. Your keys, sweep anytime.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://bitpos.app/app/"
              className="flex items-center gap-2 rounded-md bg-[#F7931A] px-6 py-3 font-['Ubuntu'] text-[14px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
            >
              Launch app <span className="font-['Ubuntu_Mono']">&raquo;</span>
            </a>
            <Link
              href="/features/app"
              className="rounded-md border border-[#F7931A]/40 px-5 py-3 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              [ How it works ]
            </Link>
          </div>
        </div>
      </main>

      {/* ===== SPEC RAIL ===== */}
      <section className="relative z-20 border-t border-dashed border-[#F7931A]/20">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-6 px-5 py-10 sm:px-8 md:grid-cols-[auto_1fr_1fr_1fr] md:items-stretch md:gap-0">
          <div className="flex flex-col justify-center pr-8">
            <span className="font-['Ubuntu'] text-[26px] font-bold leading-[0.95] text-white">ACCEPT</span>
            <span className="font-['Ubuntu'] text-[26px] font-bold leading-[0.95] text-[#F7931A]">BITCOIN</span>
            <span className="mt-2 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.18em] text-white/40">3 METHODS:</span>
          </div>
          <SpecCol tag="The App" title="POS in any browser" desc="Open bitPOS on any phone. Enter an amount, show a Lightning QR, get paid. No installs, no hardware to pair." href="/features/app" />
          <SpecCol tag="The Box" title="NFC counter terminal" desc="A dedicated physical tap-to-pay terminal for the counter. Customers tap, Lightning settles, you keep moving." href="/features/box" />
          <SpecCol tag="Bolt Cards" title="Tap-to-pay cards" desc="Issue NFC Bolt Cards with cryptographic auth on every tap. Hand one out, get paid by tap." href="/features/cards" />
        </div>
      </section>
    </BlueprintShell>
  );
}
