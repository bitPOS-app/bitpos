import { motion } from "framer-motion";
import { Link } from "wouter";

const rv = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };
const delay = (d: number) => ({ ...rv, visible: { ...rv.visible, transition: { ...rv.visible.transition, delay: d } } });

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
    legacy: "1.5% - 3.5% per transaction, plus interchange, plus monthly fees.",
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

function CreditCardSVG() {
  return (
    <div className="cmp-card cmp-card--legacy">
      <div className="cmp-card-top">
        <div className="cmp-chip">
          <div className="cmp-chip-inner" />
        </div>
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
          <svg viewBox="0 0 24 24">
            <path fill="#ea7c1e" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>
          </svg>
        </div>
      </div>
      <div className="cmp-hmac-row">
        <span className="cmp-hmac-label">HMAC</span>
        <span className="cmp-hmac-val">a3f9…c12e</span>
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
    <div>
      <div className="wrap">

        {/* Hero */}
        <section className="fp-hero">
          <motion.div initial="hidden" animate="visible" variants={rv}>
            <div className="lp-badge">
              <span className="dot" />
              Security Comparison
            </div>
          </motion.div>
          <motion.h1 initial="hidden" animate="visible" variants={delay(0.07)}>
            Credit cards ship with their{" "}
            <span style={{ color: "#ef4444", textDecoration: "line-through" }}>private key</span>{" "}
            printed on them.
          </motion.h1>
          <motion.p className="lp-lede" initial="hidden" animate="visible" variants={delay(0.14)}>
            The 16-digit number on your credit card IS your account credential. You hand it to waiters, type it into websites, and give it to strangers. That's the entire security model. <strong>Bolt Cards are built on cryptographic proof instead.</strong>
          </motion.p>
        </section>

        {/* Card Visual Comparison */}
        <motion.div
          className="cmp-cards-row"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2 }}
        >
          <div className="cmp-side">
            <div className="cmp-side-label cmp-side-label--bad">Legacy Credit Card</div>
            <CreditCardSVG />
            <p className="cmp-side-note">
              The secret that authorises payments is literally embossed on the front and engraved on the back. Every merchant you visit gets a copy of it.
            </p>
          </div>
          <div className="cmp-vs">VS</div>
          <div className="cmp-side">
            <div className="cmp-side-label cmp-side-label--good">Bolt Card</div>
            <BoltCardSVG />
            <p className="cmp-side-note">
              The private key lives inside an NTAG424 DNA chip and never transmits. Each tap produces a unique, single-use signature. Replaying it is cryptographically impossible.
            </p>
          </div>
        </motion.div>

        {/* The WTF section */}
        <motion.section
          className="fp-section cmp-wtf"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">Wait - the CVV is a <span style={{ color: "#ef4444" }}>second secret</span>. On the same card. Also printed on it.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            Visa's answer to card number theft was to add a 3-digit backup secret. Then print it on the back of the same card. The security improvement is that online merchants can only steal your card number AND the backup secret, not just one of them.
          </p>
          <div className="cmp-callout">
            <span className="cmp-callout-emoji">&#128561;</span>
            <div>
              <strong>The entire global payments system</strong> runs on the assumption that your 16-digit credential stays secret - while requiring you to hand it to every merchant, type it into every website, and trust every waiter who takes your card out of sight.
            </div>
          </div>
          <p className="lp-lede" style={{ marginTop: "24px" }}>
            Chargebacks don't solve this. They're a customer service workaround for a system where theft is architecturally inevitable. The banks know. Visa knows. They just charge merchants 2% to compensate for the fraud they designed in.
          </p>
        </motion.section>

        {/* How Bolt Cards actually work */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">How Bolt Cards actually prove payment authority.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            Bolt Cards use <strong>NTAG424 DNA</strong> chips - a chip that can perform AES-128 cryptography internally. The private key is programmed into it once and can never be read back out. Here's what happens on every tap:
          </p>
          <div className="cmp-steps">
            <div className="cmp-step">
              <div className="cmp-step-num">1</div>
              <div>
                <strong>Card taps the terminal.</strong> The chip generates a unique HMAC signature using the secret key and an incrementing counter.
              </div>
            </div>
            <div className="cmp-step">
              <div className="cmp-step-num">2</div>
              <div>
                <strong>Terminal receives the signature.</strong> It sends the HMAC to bitPOS for verification. No secret is transmitted - only the proof.
              </div>
            </div>
            <div className="cmp-step">
              <div className="cmp-step-num">3</div>
              <div>
                <strong>bitPOS verifies the HMAC.</strong> It checks the signature against the stored key, confirms the counter is higher than the last tap (no replays), and authorises the spend.
              </div>
            </div>
            <div className="cmp-step">
              <div className="cmp-step-num">4</div>
              <div>
                <strong>Lightning payment routes.</strong> Sats move from the cardholder's wallet to the merchant's node. Settled. Final. No chargeback possible.
              </div>
            </div>
          </div>
        </motion.section>

        {/* Comparison Table */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">Side by side.</h2>
          <div className="cmp-table">
            <div className="cmp-table-head">
              <div className="cmp-th cmp-th--label" />
              <div className="cmp-th cmp-th--legacy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, marginRight: 8 }}>
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
                Credit Card
              </div>
              <div className="cmp-th cmp-th--bolt">
                <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, marginRight: 8 }}>
                  <path fill="#ea7c1e" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>
                </svg>
                Bolt Card
              </div>
            </div>
            {ROWS.map((row) => (
              <div key={row.label} className="cmp-row">
                <div className="cmp-cell cmp-cell--label">{row.label}</div>
                <div className={`cmp-cell cmp-cell--legacy${row.danger ? " cmp-cell--danger" : ""}`}>
                  {row.danger && <span className="cmp-x">&#10005;</span>}
                  {row.legacy}
                </div>
                <div className="cmp-cell cmp-cell--bolt">
                  <span className="cmp-check">&#10003;</span>
                  {row.bolt}
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section
          className="lp-final"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={rv}
        >
          <h2 className="lp-big">Issue your first Bolt Card today.</h2>
          <p className="lp-lede">Cryptographic tap-to-pay. No card number. No CVV. No fraud risk.</p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Get Started</a>
            <Link to="/features/cards" className="cta-ghost cta-lg">
              How Bolt Cards work &#8594;
            </Link>
          </div>
        </motion.section>

      </div>

      <style>{`
        /* Card visuals */
        .cmp-cards-row {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          gap: 32px;
          padding: 16px 0 72px;
          flex-wrap: wrap;
        }
        .cmp-side {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          max-width: 300px;
        }
        .cmp-side-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          padding: 4px 14px;
          border-radius: 99px;
        }
        .cmp-side-label--bad { background: rgba(239,68,68,.15); color: #ef4444; border: 1px solid rgba(239,68,68,.3); }
        .cmp-side-label--good { background: rgba(234,124,30,.15); color: var(--orange); border: 1px solid rgba(234,124,30,.3); }
        .cmp-vs {
          font-size: 28px;
          font-weight: 900;
          color: rgba(255,255,255,.15);
          align-self: center;
          padding-top: 60px;
        }
        .cmp-side-note {
          font-size: 13px;
          color: rgba(255,255,255,.5);
          text-align: center;
          line-height: 1.6;
          margin: 0;
        }

        /* Card SVG styles */
        .cmp-card {
          width: 280px;
          height: 176px;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,.5);
          font-family: 'Courier New', monospace;
        }
        .cmp-card--legacy {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          border: 1px solid rgba(255,255,255,.1);
        }
        .cmp-card--bolt {
          background: linear-gradient(135deg, #1a0d05 0%, #2d1a00 50%, #1a0d05 100%);
          border: 1px solid rgba(234,124,30,.3);
        }
        .cmp-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .cmp-chip {
          width: 36px; height: 28px;
          background: linear-gradient(135deg, #d4a843, #a87c2a);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
        }
        .cmp-chip-inner {
          width: 20px; height: 16px;
          border: 1px solid rgba(0,0,0,.3);
          border-radius: 3px;
          background: linear-gradient(135deg, #c9952a, #e8c060);
        }
        .cmp-brand-logo { display: flex; align-items: center; }
        .cmp-circle {
          width: 28px; height: 28px;
          border-radius: 50%;
          opacity: .9;
        }
        .cmp-circle--l { background: #eb001b; margin-right: -10px; }
        .cmp-circle--r { background: #f79e1b; }
        .cmp-card-num {
          font-size: 15px;
          letter-spacing: .18em;
          color: rgba(255,255,255,.85);
          text-align: center;
          padding: 4px 0;
        }
        .cmp-card-bot { display: flex; gap: 20px; align-items: flex-end; }
        .cmp-card-label {
          font-size: 8px;
          letter-spacing: .1em;
          color: rgba(255,255,255,.4);
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .cmp-card-val {
          font-size: 11px;
          color: rgba(255,255,255,.8);
          letter-spacing: .05em;
        }
        .cmp-card-secret-badge {
          position: absolute;
          top: 50%;
          right: -24px;
          transform: translateY(-50%) rotate(90deg);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .15em;
          color: #ef4444;
          opacity: .6;
        }
        .cmp-card-safe-badge {
          position: absolute;
          top: 50%;
          right: -28px;
          transform: translateY(-50%) rotate(90deg);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .15em;
          color: var(--orange);
          opacity: .6;
        }
        .cmp-nfc-icon { width: 28px; height: 28px; color: rgba(234,124,30,.7); }
        .cmp-bolt-logo svg { width: 28px; height: 28px; }
        .cmp-hmac-row {
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 11px;
          padding: 2px 0;
        }
        .cmp-hmac-label {
          font-size: 8px;
          letter-spacing: .1em;
          color: rgba(234,124,30,.5);
          text-transform: uppercase;
        }
        .cmp-hmac-val {
          font-size: 11px;
          color: rgba(234,124,30,.8);
          letter-spacing: .05em;
        }

        /* WTF callout */
        .cmp-wtf { border-top: 1px solid rgba(255,255,255,.07); }
        .cmp-callout {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          background: rgba(239,68,68,.07);
          border: 1px solid rgba(239,68,68,.2);
          border-radius: 14px;
          padding: 24px;
          margin-top: 32px;
          font-size: 15px;
          line-height: 1.65;
          color: rgba(255,255,255,.75);
        }
        .cmp-callout-emoji { font-size: 32px; flex-shrink: 0; }

        /* Steps */
        .cmp-steps {
          display: flex;
          flex-direction: column;
          gap: 0;
          margin-top: 40px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px;
          overflow: hidden;
        }
        .cmp-step {
          display: flex;
          gap: 20px;
          align-items: flex-start;
          padding: 22px 24px;
          border-bottom: 1px solid rgba(255,255,255,.06);
          font-size: 15px;
          line-height: 1.6;
          color: rgba(255,255,255,.75);
        }
        .cmp-step:last-child { border-bottom: none; }
        .cmp-step-num {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(234,124,30,.15);
          border: 1px solid rgba(234,124,30,.3);
          color: var(--orange);
          font-weight: 700;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* Comparison table */
        .cmp-table {
          margin-top: 40px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 16px;
          overflow: hidden;
        }
        .cmp-table-head {
          display: grid;
          grid-template-columns: 1fr 1.4fr 1.4fr;
          background: rgba(255,255,255,.04);
          border-bottom: 1px solid rgba(255,255,255,.1);
        }
        .cmp-th {
          padding: 14px 18px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
        }
        .cmp-th--label { color: rgba(255,255,255,.35); }
        .cmp-th--legacy { color: #ef4444; border-left: 1px solid rgba(255,255,255,.06); }
        .cmp-th--bolt { color: var(--orange); border-left: 1px solid rgba(255,255,255,.06); }
        .cmp-row {
          display: grid;
          grid-template-columns: 1fr 1.4fr 1.4fr;
          border-bottom: 1px solid rgba(255,255,255,.05);
        }
        .cmp-row:last-child { border-bottom: none; }
        .cmp-cell {
          padding: 16px 18px;
          font-size: 13px;
          line-height: 1.55;
          color: rgba(255,255,255,.6);
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .cmp-cell--label {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,.4);
          letter-spacing: .02em;
          border-right: 1px solid rgba(255,255,255,.05);
        }
        .cmp-cell--legacy {
          border-left: 1px solid rgba(255,255,255,.05);
          background: rgba(239,68,68,.02);
        }
        .cmp-cell--danger { background: rgba(239,68,68,.06); }
        .cmp-cell--bolt {
          border-left: 1px solid rgba(255,255,255,.05);
          background: rgba(234,124,30,.03);
          color: rgba(255,255,255,.75);
        }
        .cmp-x { color: #ef4444; font-size: 11px; flex-shrink: 0; margin-top: 2px; font-weight: 700; }
        .cmp-check { color: #22c55e; font-size: 12px; flex-shrink: 0; margin-top: 1px; font-weight: 700; }

        @media (max-width: 640px) {
          .cmp-table-head,
          .cmp-row { grid-template-columns: 1fr; }
          .cmp-cell--label { border-right: none; border-bottom: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.03); }
          .cmp-th--label { display: none; }
          .cmp-vs { padding-top: 0; }
        }
      `}</style>
    </div>
  );
}
