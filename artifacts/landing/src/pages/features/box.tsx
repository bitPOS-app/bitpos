import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Bolt,
  CornerTicks,
  AsciiField,
  Annotation,
  BlueprintShell,
  Section,
  SectionHeading,
  FeatureBullets,
  TagRow,
  FinalCTA,
  LightningStrike,
  loopTransition,
} from "@/components/blueprint";

/* ── animated counter terminal: card taps, lightning strikes, screen flips ── */
function TerminalScene() {
  return (
    <div className="relative mx-auto w-full max-w-[330px] h-[400px] sm:max-w-[360px] sm:h-[420px]">
      {/* NFC arcs (left edge), flash on tap */}
      <motion.svg
        className="absolute -left-2 top-[28%] w-14 h-20 text-[#F7931A]"
        viewBox="0 0 40 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        aria-hidden="true"
        animate={{ opacity: [0.25, 0.25, 1, 0.25, 0.25] }}
        transition={{ ...loopTransition, times: [0, 0.4, 0.48, 0.6, 1] }}
      >
        <path d="M32 12 Q18 35 32 58" />
        <path d="M24 6 Q4 35 24 64" opacity="0.7" />
      </motion.svg>

      {/* terminal body */}
      <div className="relative mx-auto flex w-[260px] flex-col rounded-[26px] border border-[#F7931A]/55 bg-[#0B0C0E]/70 p-4">
        <CornerTicks />

        {/* header */}
        <div className="flex items-center justify-between px-1 pb-3 font-['Ubuntu_Mono'] text-[9px] uppercase tracking-[0.18em] text-[#F7931A]/80">
          <span className="flex items-center gap-1.5">
            <Bolt className="h-3 w-3 text-[#F7931A]" /> bitPOS / BOX
          </span>
          <span>Wi-Fi</span>
        </div>

        {/* screen */}
        <div className="relative grid h-[150px] place-items-center rounded-2xl border border-[#F7931A]/25 bg-black/40">
          <motion.div
            className="absolute flex flex-col items-center"
            animate={{ opacity: [1, 1, 0, 0, 1] }}
            transition={{ ...loopTransition, times: [0, 0.42, 0.48, 0.82, 0.9] }}
          >
            <span className="font-['Ubuntu'] text-[34px] font-bold leading-none text-white">4,200</span>
            <span className="mt-1 font-['Ubuntu_Mono'] text-[9px] uppercase tracking-[0.22em] text-[#F7931A]/80">Tap card to pay</span>
          </motion.div>
          <motion.div
            className="absolute flex flex-col items-center"
            animate={{ opacity: [0, 0, 1, 1, 0] }}
            transition={{ ...loopTransition, times: [0, 0.46, 0.52, 0.8, 0.88] }}
          >
            <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-[#39d98a]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#39d98a]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="mt-2 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.22em] text-[#39d98a]">Paid</span>
          </motion.div>
        </div>

        {/* base / stand */}
        <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-[#F7931A]/25" />
      </div>
      <div className="mx-auto mt-1 h-3 w-[150px] rounded-b-xl border border-t-0 border-[#F7931A]/30 bg-[#0B0C0E]/60" />

      {/* lightning strike at moment of tap */}
      <LightningStrike className="absolute left-[10%] top-[24%] z-20 h-24 w-16" origin="30% 30%" />

      {/* tapping Bolt Card (from the left) */}
      <motion.div
        className="absolute z-10 left-[-10%] top-[22%] h-[100px] w-[158px] rounded-2xl border border-[#F7931A]/60 bg-gradient-to-br from-[#1a1206] to-[#0B0C0E] shadow-[0_20px_40px_-18px_rgba(0,0,0,0.8)]"
        animate={{ x: [-48, 0, 0, -48], y: [-44, 0, 0, -44], rotate: [16, 6, 6, 16] }}
        transition={{ ...loopTransition, times: [0, 0.42, 0.56, 1] }}
      >
        <div className="absolute left-3 top-3 flex items-center gap-1.5 font-['Ubuntu'] text-[12px] font-bold">
          <span className="text-white">bit</span><span className="text-[#F7931A]">POS</span>
        </div>
        <Bolt className="absolute right-3 top-3 h-3.5 w-3.5 text-[#F7931A]" />
        <div className="absolute left-3 bottom-3 font-['Ubuntu_Mono'] text-[8px] uppercase tracking-[0.2em] text-white/45">Bolt Card</div>
        <div className="absolute right-3 bottom-3 h-5 w-7 rounded-sm border border-[#F7931A]/40 bg-[#F7931A]/10" />
      </motion.div>
    </div>
  );
}

export default function FeatureBox() {
  return (
    <BlueprintShell>
      {/* ===== HERO ===== */}
      <main className="relative z-20 mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,52%)_minmax(0,48%)] lg:gap-6 lg:pb-12 lg:pt-6">
        {/* headline */}
        <div className="order-1">
          <h1 className="font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em]" style={{ fontSize: "clamp(40px, 7vw, 78px)" }}>
            <span className="block text-white">HARDWARE</span>
            <span className="block text-white">FOR YOUR</span>
            <span className="my-1 inline-block border-2 border-[#F7931A] px-3 py-0.5 text-[#F7931A]">COUNTER</span>
          </h1>
          <p className="mt-6 max-w-md font-['Ubuntu'] text-[15px] leading-relaxed text-white/65 sm:text-[16px]">
            A dedicated Lightning terminal with NFC built in. Set it on the counter, connect to Wi-Fi,
            and it is ready to accept Bolt Card taps and QR scans with no phone required.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="https://bitpos.app/app/"
              className="flex items-center gap-2 rounded-md bg-[#F7931A] px-6 py-3 font-['Ubuntu'] text-[14px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
            >
              Order the Box <span className="font-['Ubuntu_Mono']">&raquo;</span>
            </a>
            <Link
              href="/features/cards"
              className="rounded-md border border-[#F7931A]/40 px-5 py-3 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              [ Bolt Cards ]
            </Link>
          </div>
        </div>

        {/* device */}
        <div className="relative order-2">
          <AsciiField rows={12} cols={10} className="absolute right-0 top-[10%] hidden lg:block" />
          <Annotation label="ESP-32 core" className="left-[2%] top-[6%]" />
          <Annotation label="NTAG424 NFC" className="right-[2%] top-[34%]" align="right" />
          <Annotation label="Headless / Wi-Fi" className="right-[6%] bottom-[8%]" align="right" />
          <div className="grid place-items-center py-4">
            <TerminalScene />
          </div>
        </div>
      </main>

      {/* ===== WHAT IT DOES ===== */}
      <Section>
        <SectionHeading tag="Capabilities" title="The full POS experience. No phone needed." />
        <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          The Box ships pre-configured with the latest firmware. Plug it in and it connects to your
          bitPOS account. Customers tap or scan, the screen confirms. That is it.
        </p>
        <FeatureBullets
          items={[
            "Dedicated NFC reader - no phone unlocking required at the counter",
            "Built-in screen shows the invoice QR and confirms payment",
            "Wi-Fi connected, runs headless - staff never touch a settings menu",
            "Accepts Bolt Card taps and standard Lightning QR scans",
            "Instant payment confirmation with a green tick and amount",
            "All payments sync to your bitPOS account in real time",
          ]}
        />
      </Section>

      {/* ===== SPECS ===== */}
      <Section>
        <SectionHeading tag="Hardware" title="Built on open hardware." />
        <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          ESP32 based, running open-source bitPOS firmware. The same software that runs on the web,
          packaged for a dedicated terminal.
        </p>
        <TagRow tags={["ESP-32", "NTAG424 NFC", "Wi-Fi", "HDMI display", "Open firmware", "Bolt Card"]} />
      </Section>

      {/* ===== CTA ===== */}
      <FinalCTA
        title="A real terminal. Bitcoin only."
        lede="Set it on the counter and forget about it. Lightning does the rest."
        ctaLabel="Order the Box"
        ctaHref="https://bitpos.app/app/"
        note="Coming soon - join the waitlist in the app"
      />
    </BlueprintShell>
  );
}
