import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  CornerTicks,
  QRCode,
  AsciiField,
  Annotation,
  BlueprintShell,
  Section,
  SectionHeading,
  FeatureBullets,
  TagRow,
  FinalCTA,
  loopTransition,
} from "@/components/blueprint";

/* ── animated phone: amount -> Lightning invoice QR -> paid ── */
function PhoneScene() {
  return (
    <div className="relative mx-auto w-[268px] h-[470px] sm:w-[286px] sm:h-[500px]">
      <div className="relative flex h-full w-full flex-col rounded-[40px] border border-[#F7931A]/55 bg-[#0B0C0E]/70 p-3.5">
        <CornerTicks />

        {/* status bar */}
        <div className="flex items-center justify-between px-1.5 pb-2.5 font-['Ubuntu_Mono'] text-[9px] uppercase tracking-[0.18em] text-[#F7931A]/80">
          <span>bitPOS / POS</span>
          <span>any browser</span>
        </div>

        {/* amount */}
        <div className="px-1">
          <div className="font-['Ubuntu_Mono'] text-[9px] uppercase tracking-[0.2em] text-white/40">Charge amount</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-['Ubuntu'] text-[40px] font-bold leading-none text-white">4,200</span>
            <span className="mb-1 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.2em] text-[#F7931A]">sats</span>
          </div>
          <div className="mt-1 font-['Ubuntu_Mono'] text-[10px] text-white/40">~ $2.94 USD</div>
        </div>

        {/* QR panel */}
        <div className="flex flex-1 items-center justify-center">
          <div className="relative h-[150px] w-[150px] rounded-xl bg-[#f3ebe3] p-2.5 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.7)]">
            <QRCode className="h-full w-full" />
            <span className="absolute -left-1 -top-1 h-3 w-3 border-l border-t border-[#F7931A]" />
            <span className="absolute -right-1 -top-1 h-3 w-3 border-r border-t border-[#F7931A]" />
            <span className="absolute -left-1 -bottom-1 h-3 w-3 border-l border-b border-[#F7931A]" />
            <span className="absolute -right-1 -bottom-1 h-3 w-3 border-r border-b border-[#F7931A]" />
          </div>
        </div>

        {/* status line: AWAITING <-> PAID */}
        <div className="relative grid h-6 place-items-center font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.22em]">
          <motion.span
            className="absolute flex items-center gap-2 text-[#F7931A]/80"
            animate={{ opacity: [1, 1, 0, 0, 1] }}
            transition={{ ...loopTransition, times: [0, 0.42, 0.48, 0.82, 0.9] }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#F7931A]" /> Awaiting payment
          </motion.span>
          <motion.span
            className="absolute flex items-center gap-2 text-[#39d98a]"
            animate={{ opacity: [0, 0, 1, 1, 0] }}
            transition={{ ...loopTransition, times: [0, 0.46, 0.52, 0.8, 0.88] }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#39d98a]" /> Paid 4,200 sats
          </motion.span>
        </div>

        {/* speaker line */}
        <div className="mx-auto mt-1.5 h-1 w-12 rounded-full bg-[#F7931A]/25" />
      </div>

      {/* scan pulse over the QR at settle moment */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[52%] h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#39d98a]/60"
        aria-hidden="true"
        animate={{ opacity: [0, 0, 0.8, 0], scale: [0.6, 0.6, 1.25, 1.6] }}
        transition={{ ...loopTransition, times: [0, 0.44, 0.5, 0.7] }}
      />
    </div>
  );
}

export default function FeatureApp() {
  return (
    <BlueprintShell>
      {/* ===== HERO ===== */}
      <main className="relative z-20 mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:gap-6 lg:pb-12 lg:pt-6">
        {/* device */}
        <div className="relative order-2 lg:order-1">
          <AsciiField rows={14} cols={10} className="absolute left-0 top-[8%] hidden lg:block" />
          <Annotation label="Runs in any browser" className="left-[2%] top-[2%]" />
          <Annotation label="LNURL invoice" className="right-[2%] top-[26%]" align="right" />
          <Annotation label="No install" className="left-[4%] bottom-[8%]" />
          <div className="grid place-items-center py-4">
            <PhoneScene />
          </div>
        </div>

        {/* headline */}
        <div className="order-1 lg:order-2">
          <h1 className="font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em]" style={{ fontSize: "clamp(42px, 7.5vw, 84px)" }}>
            <span className="block text-white">YOUR POS</span>
            <span className="block text-white">LIVES IN A</span>
            <span className="my-1 inline-block border-2 border-[#F7931A] px-3 py-0.5 text-[#F7931A]">URL</span>
          </h1>
          <p className="mt-6 max-w-md font-['Ubuntu'] text-[15px] leading-relaxed text-white/65 sm:text-[16px]">
            Open a tab, start taking payments. No app store, no card reader to pair, no software to
            install. bitPOS runs in any browser, on any device.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://bitpos.app/app/"
              className="flex items-center gap-2 rounded-md bg-[#F7931A] px-6 py-3 font-['Ubuntu'] text-[14px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
            >
              Launch app <span className="font-['Ubuntu_Mono']">&raquo;</span>
            </a>
            <Link
              href="/features/box"
              className="rounded-md border border-[#F7931A]/40 px-5 py-3 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              [ The Box ]
            </Link>
          </div>
        </div>
      </main>

      {/* ===== WHAT IT DOES ===== */}
      <Section>
        <SectionHeading tag="Capabilities" title="Everything a POS needs. Nothing it does not." />
        <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          Create an account, open the app, enter an amount. Your customer scans the QR and pays, sats
          arrive instantly.
        </p>
        <FeatureBullets
          items={[
            "Sats and fiat display side by side - quote in any of 40+ currency denominations, settle in Lightning",
            "Invoices generated instantly with no previous node setup necessary",
            "Every payment logged with amount, status, and timestamp",
            "Self-custodial sweep - move your balance to your own Lightning wallet at any time",
            "Runs on the same device your staff already uses, no dedicated hardware required",
          ]}
        />
      </Section>

      {/* ===== OPEN SOURCE ===== */}
      <Section>
        <SectionHeading tag="Transparency" title="Open source. Auditable. Always." />
        <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          Every build ships with the git commit that produced it. Click the version tag in the footer
          to verify the source. Licensed under AGPL-3.0 - anyone can verify what is running.
        </p>
        <TagRow tags={["AGPL-3.0", "Lightning Network", "LNURL", "WebNFC", "Self-custodial", "Instant settlement"]} />
      </Section>

      {/* ===== CTA ===== */}
      <FinalCTA
        title="Accept your first payment in under a minute."
        lede="No hardware. No waiting. Just a URL and a browser."
        ctaLabel="Launch app"
        ctaHref="https://bitpos.app/app/"
        note="No signup fee - 0% fee on in-network payments"
      />
    </BlueprintShell>
  );
}
