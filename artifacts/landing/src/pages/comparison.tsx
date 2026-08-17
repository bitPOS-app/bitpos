import { Link } from "wouter";
import {
  BlueprintShell,
  Section,
  SectionHeading,
  FinalCTA,
} from "@/components/blueprint";

const ROWS = [
  {
    label: "Authentication",
    legacy: "The card number IS the secret. Whoever has it, spends it.",
    bolt: "Cryptographic HMAC on every tap. The secret never leaves the chip.",
    danger: true,
  },
  {
    label: "What you hand the merchant",
    legacy: "Your full account credentials - card number, expiry, CVV.",
    bolt: "A single-use cryptographic signature. Useless after the transaction.",
    danger: true,
  },
  {
    label: "Replay attacks",
    legacy: "Your card number works forever until you cancel the card.",
    bolt: "NTAG424 DNA increments a counter on every tap. Old signatures are rejected.",
    danger: true,
  },
  {
    label: "Settlement",
    legacy: "3-5 business days. You paid but the merchant waits.",
    bolt: "Seconds. Lightning routes the payment before the customer pockets their phone.",
    danger: false,
  },
  {
    label: "Fees",
    legacy: "1.5%-3.5% per transaction, plus interchange, plus monthly fees.",
    bolt: "Sub-cent routing fees. Often fractions of a sat.",
    danger: false,
  },
  {
    label: "Who can block your payment",
    legacy: "Visa, Mastercard, your bank, the merchant's bank. Any one of them.",
    bolt: "Nobody. Lightning is a peer-to-peer network. No permission required.",
    danger: false,
  },
  {
    label: "Privacy",
    legacy: "Name, address, spending history - all linked to every transaction.",
    bolt: "A payment hash. No name. No address. No profile.",
    danger: false,
  },
  {
    label: "Why chargebacks exist",
    legacy: "Because fraud is trivial. The 'security' is just your secret being a secret.",
    bolt: "Chargebacks don't exist. You can't fake a signature you don't have.",
    danger: true,
  },
  {
    label: "Who controls your access",
    legacy: "Your bank. They can freeze, block, or close your account unilaterally.",
    bolt: "You. It's your Lightning wallet. No one can freeze a math equation.",
    danger: false,
  },
];

const STEPS = [
  {
    n: "01",
    strong: "Card taps the terminal.",
    body: "The chip generates a unique HMAC signature using the secret key and an incrementing counter.",
  },
  {
    n: "02",
    strong: "Terminal receives the signature.",
    body: "It sends the HMAC to bitPOS for verification. No secret is transmitted - only the proof.",
  },
  {
    n: "03",
    strong: "bitPOS verifies the HMAC.",
    body: "It checks the signature against the stored key, confirms the counter is higher than the last tap (no replays), and authorises the spend.",
  },
  {
    n: "04",
    strong: "Lightning payment routes.",
    body: "Sats move from the cardholder's wallet to the merchant's node. Settled. Final. No chargeback possible.",
  },
];

function CreditCardSVG() {
  return (
    <div className="cmp-card cmp-card--legacy">
      <div className="cmp-card-top">
        <div className="cmp-chip"><div className="cmp-chip-inner" /></div>
        <div className="cmp-brand-logo">
          <div className="cmp-circle cmp-circle--l" />
          <div className="cmp-circle cmp-circle--r" />
        </div>
      </div>
      <div className="cmp-card-num">4242 4242 4242 4242</div>
      <div className="cmp-card-bot">
        <div>
          <div className="cmp-card-label">CARDHOLDER</div>
          <div className="cmp-card-val">SATOSHI NAKAMOTO</div>
        </div>
        <div>
          <div className="cmp-card-label">EXPIRES</div>
          <div className="cmp-card-val">01/30</div>
        </div>
        <div>
          <div className="cmp-card-label">CVV</div>
          <div className="cmp-card-val">123</div>
        </div>
      </div>
      <div className="cmp-card-secret-badge">YOUR PASSWORD</div>
    </div>
  );
}

function BoltCardSVG() {
  return (
    <div className="cmp-card cmp-card--bolt">
      <div className="cmp-card-top">
        <div className="cmp-nfc-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div className="cmp-bolt-logo">
          <svg viewBox="0 0 180 180">
            <path fill="#F7931A" d="M103 22L52 98h46l-21 60 79-82H112l21-54z"/>
          </svg>
        </div>
      </div>
      <div className="cmp-hmac-row">
        <span className="cmp-hmac-label">HMAC</span>
        <span className="cmp-hmac-val">a3f9...c12e</span>
        <span className="cmp-hmac-label">CNT</span>
        <span className="cmp-hmac-val">0041</span>
      </div>
      <div className="cmp-card-bot">
        <div>
          <div className="cmp-card-label">STANDARD</div>
          <div className="cmp-card-val">NTAG424 DNA</div>
        </div>
        <div>
          <div className="cmp-card-label">PROTOCOL</div>
          <div className="cmp-card-val">LNURL-w</div>
        </div>
      </div>
      <div className="cmp-card-safe-badge">KEY NEVER LEAVES</div>
    </div>
  );
}

export default function Comparison() {
  return (
    <BlueprintShell>
      <main className="relative z-20 mx-auto max-w-[1100px] px-5 sm:px-8 pb-20 pt-10">

        {/* ── Hero ── */}
        <div className="pb-14 pt-2">
          <span className="font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-[#F7931A]/80">
            Security Comparison
          </span>
          <h1
            className="mt-3 font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em] text-white"
            style={{ fontSize: "clamp(34px, 5.5vw, 62px)" }}
          >
            Credit cards ship with their{" "}
            <span className="line-through text-red-500">private key</span>{" "}
            printed on them.
          </h1>
          <p className="mt-6 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
            The 16-digit number on your credit card IS your account credential. You hand it to waiters, type it into websites, and give it to strangers. That is the entire security model.{" "}
            <strong className="text-white/85">Bolt Cards are built on cryptographic proof instead.</strong>
          </p>
        </div>

        {/* ── Card visual comparison ── */}
        <div className="flex flex-wrap items-start justify-center gap-8 border-t border-dashed border-[#F7931A]/20 py-14">
          <div className="flex max-w-[300px] flex-col items-center gap-5">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.12em] text-red-500">
              Legacy Credit Card
            </span>
            <CreditCardSVG />
            <p className="text-center font-['Ubuntu'] text-[13px] leading-relaxed text-white/50">
              The secret that authorises payments is literally embossed on the front and engraved on the back. Every merchant you visit gets a copy of it.
            </p>
          </div>
          <div className="self-center pt-16 font-['Ubuntu_Mono'] text-[26px] font-black text-white/15">
            VS
          </div>
          <div className="flex max-w-[300px] flex-col items-center gap-5">
            <span className="rounded-full border border-[#F7931A]/30 bg-[#F7931A]/10 px-3 py-1 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.12em] text-[#F7931A]">
              Bolt Card
            </span>
            <BoltCardSVG />
            <p className="text-center font-['Ubuntu'] text-[13px] leading-relaxed text-white/50">
              The private key lives inside an NTAG424 DNA chip and never transmits. Each tap produces a unique, single-use signature. Replaying it is cryptographically impossible.
            </p>
          </div>
        </div>

        {/* ── WTF section ── */}
        <Section>
          <h2
            className="font-['Ubuntu'] font-bold leading-[1.1] tracking-[-0.02em] text-white"
            style={{ fontSize: "clamp(22px, 3.5vw, 38px)" }}
          >
            Wait - the CVV is a{" "}
            <span className="text-red-500">second secret</span>. On the same card. Also printed on it.
          </h2>
          <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
            Visa's answer to card number theft was to add a 3-digit backup secret. Then print it on the back of the same card. The security improvement is that online merchants can only steal your card number AND the backup secret, not just one of them.
          </p>
          <div className="mt-8 flex items-start gap-5 rounded-lg border border-red-500/20 bg-red-500/5 p-6">
            <span className="flex-shrink-0 text-3xl">&#128561;</span>
            <p className="font-['Ubuntu'] text-[14px] leading-relaxed text-white/70">
              <strong className="text-white/90">The entire global payments system</strong> runs on the assumption that your 16-digit credential stays secret - while requiring you to hand it to every merchant, type it into every website, and trust every waiter who takes your card out of sight.
            </p>
          </div>
          <p className="mt-6 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
            Chargebacks don't solve this. They're a customer service workaround for a system where theft is architecturally inevitable. The banks know. Visa knows. They just charge merchants 2% to compensate for the fraud they designed in.
          </p>
        </Section>

        {/* ── How Bolt Cards work ── */}
        <Section>
          <SectionHeading tag="Protocol" title="How Bolt Cards actually prove payment authority." />
          <p className="mt-4 max-w-2xl font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
            Bolt Cards use <strong className="text-white/85">NTAG424 DNA</strong> chips - a chip that can perform AES-128 cryptography internally. The private key is programmed into it once and can never be read back out. Here is what happens on every tap:
          </p>
          <div className="mt-8 divide-y divide-dashed divide-[#F7931A]/15 rounded-lg border border-dashed border-[#F7931A]/20">
            {STEPS.map((s) => (
              <div key={s.n} className="flex items-start gap-5 px-6 py-5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#F7931A]/30 bg-[#F7931A]/10 font-['Ubuntu_Mono'] text-[11px] text-[#F7931A]">
                  {s.n}
                </span>
                <p className="font-['Ubuntu'] text-[14px] leading-relaxed text-white/65">
                  <strong className="text-white/90">{s.strong}</strong>{" "}{s.body}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Comparison table ── */}
        <Section>
          <SectionHeading tag="Side by side" title="The full picture." />
          <div className="mt-8 overflow-hidden rounded-lg border border-dashed border-[#F7931A]/20">
            {/* header row */}
            <div className="grid grid-cols-[1fr_1.4fr_1.4fr] border-b border-dashed border-[#F7931A]/20 bg-white/[0.02]">
              <div className="p-3 sm:p-4" />
              <div className="flex items-center gap-2 border-l border-dashed border-[#F7931A]/15 p-3 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.1em] text-red-500 sm:p-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-shrink-0">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                Credit Card
              </div>
              <div className="flex items-center gap-2 border-l border-dashed border-[#F7931A]/15 p-3 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.1em] text-[#F7931A] sm:p-4">
                <svg viewBox="0 0 180 180" className="h-4 w-4 flex-shrink-0">
                  <path fill="#F7931A" d="M103 22L52 98h46l-21 60 79-82H112l21-54z"/>
                </svg>
                Bolt Card
              </div>
            </div>
            {ROWS.map((row) => (
              <div key={row.label} className="grid grid-cols-[1fr_1.4fr_1.4fr] border-b border-dashed border-[#F7931A]/10 last:border-b-0">
                <div className="p-3 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.08em] text-white/35 sm:p-4">
                  {row.label}
                </div>
                <div className={`flex items-start gap-2 border-l border-dashed border-[#F7931A]/10 p-3 font-['Ubuntu'] text-[13px] leading-snug sm:p-4 ${row.danger ? "text-red-400/80 bg-red-500/[0.03]" : "text-white/55"}`}>
                  {row.danger && (
                    <span className="mt-0.5 flex-shrink-0 font-['Ubuntu_Mono'] text-[11px] font-bold text-red-500">x</span>
                  )}
                  {row.legacy}
                </div>
                <div className="flex items-start gap-2 border-l border-dashed border-[#F7931A]/10 bg-[#F7931A]/[0.02] p-3 font-['Ubuntu'] text-[13px] leading-snug text-white/75 sm:p-4">
                  <span className="mt-0.5 flex-shrink-0 font-['Ubuntu_Mono'] text-[11px] font-bold text-[#F7931A]">+</span>
                  {row.bolt}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Final CTA ── */}
        <FinalCTA
          title="Issue your first Bolt Card today."
          lede="Cryptographic tap-to-pay. No card number. No CVV. No fraud risk."
          ctaLabel="Get Started"
          ctaHref="https://bitpos.app/app/"
          secondaryLabel="How Bolt Cards work"
          secondaryHref="/features/cards"
        />

      </main>

      <style>{`
        .cmp-card {
          width: 280px; height: 176px;
          border-radius: 16px; padding: 20px;
          display: flex; flex-direction: column;
          justify-content: space-between;
          position: relative; overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,.5);
          font-family: 'Ubuntu Mono', monospace;
        }
        .cmp-card--legacy {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          border: 1px solid rgba(255,255,255,.1);
        }
        .cmp-card--bolt {
          background: linear-gradient(135deg, #1a0d05 0%, #2d1a00 50%, #1a0d05 100%);
          border: 1px solid rgba(247,147,26,.3);
        }
        .cmp-card-top { display:flex; justify-content:space-between; align-items:flex-start; }
        .cmp-chip { width:36px; height:28px; background:linear-gradient(135deg,#d4a843,#a87c2a); border-radius:6px; display:flex; align-items:center; justify-content:center; }
        .cmp-chip-inner { width:20px; height:16px; border:1px solid rgba(0,0,0,.3); border-radius:3px; background:linear-gradient(135deg,#c9952a,#e8c060); }
        .cmp-brand-logo { display:flex; align-items:center; }
        .cmp-circle { width:28px; height:28px; border-radius:50%; opacity:.9; }
        .cmp-circle--l { background:#eb001b; margin-right:-10px; }
        .cmp-circle--r { background:#f79e1b; }
        .cmp-card-num { font-size:15px; letter-spacing:.18em; color:rgba(255,255,255,.85); text-align:center; padding:4px 0; }
        .cmp-card-bot { display:flex; gap:20px; align-items:flex-end; }
        .cmp-card-label { font-size:8px; letter-spacing:.1em; color:rgba(255,255,255,.4); text-transform:uppercase; margin-bottom:2px; }
        .cmp-card-val { font-size:11px; color:rgba(255,255,255,.8); letter-spacing:.05em; }
        .cmp-card-secret-badge { position:absolute; top:50%; right:-24px; transform:translateY(-50%) rotate(90deg); font-size:8px; font-weight:700; letter-spacing:.15em; color:#ef4444; opacity:.6; }
        .cmp-card-safe-badge { position:absolute; top:50%; right:-28px; transform:translateY(-50%) rotate(90deg); font-size:8px; font-weight:700; letter-spacing:.15em; color:#F7931A; opacity:.6; }
        .cmp-nfc-icon { width:28px; height:28px; color:rgba(247,147,26,.7); }
        .cmp-bolt-logo svg { width:28px; height:28px; }
        .cmp-hmac-row { display:flex; gap:10px; align-items:center; font-size:11px; padding:2px 0; }
        .cmp-hmac-label { font-size:8px; letter-spacing:.1em; color:rgba(247,147,26,.5); text-transform:uppercase; }
        .cmp-hmac-val { font-size:11px; color:rgba(247,147,26,.8); letter-spacing:.05em; }

        @media (max-width: 640px) {
          .cmp-table-head, .cmp-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </BlueprintShell>
  );
}
