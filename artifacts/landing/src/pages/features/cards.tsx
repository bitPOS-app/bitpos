import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Bolt,
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

/* ── animated Bolt Card: NFC arcs pulse, lightning strikes on tap ── */
function CardScene() {
  return (
    <div className="relative mx-auto grid h-[340px] w-full max-w-[340px] place-items-center sm:h-[400px] sm:max-w-[380px]">
      {/* concentric tap rings */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute rounded-full border border-[#F7931A]/40"
          style={{ width: 150 + i * 70, height: 150 + i * 70 }}
          aria-hidden="true"
          animate={{ opacity: [0, 0, 0.7, 0], scale: [0.7, 0.7, 1.08, 1.2] }}
          transition={{ ...loopTransition, times: [0, 0.42, 0.5, 0.72], delay: i * 0.08 }}
        />
      ))}

      {/* the Bolt Card */}
      <motion.div
        className="relative z-10 h-[190px] w-[290px] rounded-[20px] border border-[#F7931A]/60 bg-gradient-to-br from-[#1a1206] to-[#0B0C0E] p-5 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.85)] sm:h-[210px] sm:w-[320px]"
        animate={{ rotate: [-3, 1, -3], y: [0, -4, 0] }}
        transition={{ ...loopTransition, times: [0, 0.5, 1] }}
      >
        <div className="flex items-center gap-1.5 font-['Ubuntu'] text-[20px] font-bold">
          <span className="text-white">bit</span><span className="text-[#F7931A]">POS</span>
        </div>
        <Bolt className="absolute right-5 top-5 h-7 w-7 text-[#F7931A]" />
        <div className="absolute left-5 top-[46%] h-7 w-9 rounded-md border border-[#F7931A]/40 bg-[#F7931A]/10" />
        <div className="absolute bottom-5 left-5 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.24em] text-white/50">
          Bolt Card
        </div>
        <div className="absolute bottom-5 right-5 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-white/40">
          BITPOS.APP
        </div>
      </motion.div>

      {/* NFC arcs at top-right corner */}
      <motion.svg
        className="absolute right-[8%] top-[12%] z-20 h-20 w-16 text-[#F7931A]"
        viewBox="0 0 40 70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
        animate={{ opacity: [0.25, 0.25, 1, 0.25, 0.25] }}
        transition={{ ...loopTransition, times: [0, 0.4, 0.48, 0.6, 1] }}
      >
        <path d="M8 12 Q22 35 8 58" />
        <path d="M16 6 Q36 35 16 64" opacity="0.7" />
      </motion.svg>

      {/* lightning strike at tap */}
      <LightningStrike className="absolute right-[18%] top-[6%] z-30 h-24 w-16" origin="50% 20%" />
    </div>
  );
}

/* ── tap-to-pay flow as a blueprint sequence ── */
const FLOW = [
  { n: "01", title: "Customer taps card", sub: "NTAG424 chip emits a signed lnurlw:// over NFC" },
  { n: "02", title: "bitPOS authenticates", sub: "Verifies the cryptogram and checks spend limits" },
  { n: "03", title: "Lightning routes payment", sub: "Invoice paid over the Lightning Network" },
  { n: "04", title: "Settled", sub: "Sats land in your bitPOS account. Under a second." },
];

function FlowDiagram() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {FLOW.map((step, i) => (
        <div
          key={step.n}
          className="relative flex flex-col gap-2 rounded-lg border border-[#F7931A]/25 bg-black/20 p-5"
        >
          <span className="font-['Ubuntu_Mono'] text-[11px] tracking-[0.2em] text-[#F7931A]">{step.n}</span>
          <h3 className="font-['Ubuntu'] text-[15px] font-bold text-white">{step.title}</h3>
          <p className="font-['Ubuntu'] text-[13px] leading-relaxed text-white/55">{step.sub}</p>
          {i < FLOW.length - 1 && (
            <span className="pointer-events-none absolute right-[-14px] top-1/2 z-10 hidden -translate-y-1/2 font-['Ubuntu_Mono'] text-[#F7931A]/70 lg:block">
              &raquo;
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FeatureCards() {
  return (
    <BlueprintShell>
      {/* ===== HERO ===== */}
      <main className="relative z-20 mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,48%)_minmax(0,52%)] lg:gap-6 lg:pb-12 lg:pt-6">
        {/* card */}
        <div className="relative order-2 lg:order-1">
          <AsciiField rows={12} cols={10} className="absolute left-0 top-[8%] hidden lg:block" />
          <Annotation label="NTAG424 DNA" className="left-[2%] top-[4%]" />
          <Annotation label="AES-128 cryptogram" className="right-[0%] top-[28%]" align="right" />
          <Annotation label="LNURL-withdraw" className="left-[4%] bottom-[8%]" />
          <div className="grid place-items-center py-4">
            <CardScene />
          </div>
        </div>

        {/* headline */}
        <div className="order-1 lg:order-2">
          <h1 className="font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em]" style={{ fontSize: "clamp(42px, 7.5vw, 84px)" }}>
            <span className="block text-white">TAP TO PAY</span>
            <span className="my-1 inline-block border-2 border-[#F7931A] px-3 py-0.5 text-[#F7931A]">LIGHTNING</span>
            <span className="block text-white">SETTLEMENT</span>
          </h1>
          <p className="mt-6 max-w-md font-['Ubuntu'] text-[15px] leading-relaxed text-white/65 sm:text-[16px]">
            NFC Bolt Cards your customers hold like any bank card. They tap, Lightning routes the
            payment, and sats land in your bitPOS account instantly. No app required on either side.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="/app/business/shop"
              className="flex items-center gap-2 rounded-md bg-[#F7931A] px-6 py-3 font-['Ubuntu'] text-[14px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
            >
              Order cards <span className="font-['Ubuntu_Mono']">&raquo;</span>
            </a>
            <Link
              href="/features/app"
              className="rounded-md border border-[#F7931A]/40 px-5 py-3 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              [ The Box ]
            </Link>
          </div>
        </div>
      </main>

      {/* ===== HOW IT WORKS ===== */}
      <Section>
        <SectionHeading tag="Protocol" title="How a tap-to-pay works." />
        <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          Four steps and one Lightning payment. Under a second, start to finish.
        </p>
        <FlowDiagram />
      </Section>

      {/* ===== FEATURES ===== */}
      <Section>
        <SectionHeading tag="Standard" title="Cards issued by bitPOS. Accepted everywhere." />
        <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/60">
          Bolt Cards follow the open LNURL-withdraw standard. A card issued by bitPOS works at any
          compatible terminal - Breez, BTCPay Server, VoltPay, CoinCorner - and any Bolt Card issued
          elsewhere works at bitPOS.
        </p>
        <FeatureBullets
          items={[
            "NTAG424 DNA chip - cryptographic authentication on every single tap, no replay attacks",
            "Programmable spend limits per card - cap daily or per-tap amounts",
            "Universal - works at any LNURL-withdraw compatible merchant",
            "Issue to customers or program existing NTAG424 cards you already have",
            "Full tap history visible in the merchant dashboard",
          ]}
        />
        <TagRow tags={["NTAG424 DNA", "LNURL-withdraw", "Open standard", "Spend limits", "Replay protection", "NFC"]} />
      </Section>

      {/* ===== CTA ===== */}
      <FinalCTA
        title="Issue your first card today."
        lede="Plain white NTAG424 cards shipped to your door. Program them in the app."
        ctaLabel="Order cards"
        ctaHref="/app/business/shop"
        note="Custom card design studio"
      />
    </BlueprintShell>
  );
}
