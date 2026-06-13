import { Fragment, useState } from "react";
import { motion } from "framer-motion";

const rv = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };

type Step = {
  title: string;
  sub: string;
  mod?: string;
  icon: React.ReactNode;
  msg: string;
  dir: "r" | "l";
  accent?: boolean;
};

const STEPS: Step[] = [
  {
    title: "Bolt Card", sub: "NFC chip tap", mod: "bolt",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
      </svg>
    ),
    msg: "lnurlw:// NFC", dir: "r",
  },
  {
    title: "bitPOS Service", sub: "Auth + spend limit check",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    msg: "Payment Request", dir: "l",
  },
  {
    title: "Lightning Node", sub: "Routes payment over network",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 7v2m0 6v2M9.5 9.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 0 1.5-1.5"/>
      </svg>
    ),
    msg: "Lightning Payment", dir: "r", accent: true,
  },
  {
    title: "Confirmed", sub: "Funds in wallet. Done.", mod: "ok",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    msg: "Payment Complete", dir: "l",
  },
];

function TapToPayDiagram() {
  return (
    <div className="td">
      <div className="td-heads">
        <span className="td-head">Customer</span>
        <span className="td-head">Merchant (bitPOS)</span>
      </div>

      <div className="td-grid">
        {STEPS.map((s, i) => {
          const row = i * 2 + 1;
          return (
            <Fragment key={i}>
              {i > 0 && (
                <div className="td-conn" style={{ gridColumn: 1, gridRow: row - 1 }} />
              )}

              <div
                className={`td-node${s.mod ? ` td-node--${s.mod}` : ""}`}
                style={{ gridColumn: 1, gridRow: row }}
              >
                <div className="td-ic">{s.icon}</div>
                <div>
                  <p className="td-ntitle">{s.title}</p>
                  <p className="td-nsub">{s.sub}</p>
                </div>
              </div>

              <div
                className={`td-msg td-msg--${s.dir}${s.accent ? " td-msg--accent" : ""}`}
                style={{ gridColumn: 2, gridRow: row }}
              >
                <div className="td-track">
                  {s.dir === "l" && <span className="td-ptr td-ptr--l" />}
                  <div className="td-line" />
                  {s.dir === "r" && <span className="td-ptr td-ptr--r" />}
                </div>
                <span className="td-mlabel">{s.msg}</span>
              </div>
            </Fragment>
          );
        })}

        <div className="td-merchant" style={{ gridColumn: 3, gridRow: "1 / 8" }}>
          <div className="td-mic">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="5" y="5" width="3" height="3" fill="#140a05"/>
              <rect x="16" y="5" width="3" height="3" fill="#140a05"/>
              <rect x="5" y="16" width="3" height="3" fill="#140a05"/>
              <path d="M14 14h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zm-2 4h2v2h-2zm2 2h2"/>
            </svg>
          </div>
          <p className="td-mtitle">bitPOS Terminal</p>
          <p className="td-msub">Point of sale + Bolt Card acquirer</p>
        </div>
      </div>
    </div>
  );
}

function BoltCard({ dark }: { dark: boolean }) {
  const boltFill = dark ? "#ea7c1e" : "#888890";

  return (
    <div className={`bcard ${dark ? "dark" : "light"}`}>
      <div className="bc-brand">
        <span className="bit">bit</span><span className="pos">POS</span>
      </div>
      <div className="bc-bolt">
        <svg viewBox="0 0 24 24">
          <path fill={boltFill} d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      </div>
      <div className="bc-url">BITPOS.APP</div>
    </div>
  );
}

export default function FeatureCards() {
  const [dark, setDark] = useState(true);

  return (
    <div>
      <div className="wrap">

        {/* Hero */}
        <section className="fp-hero">
          <motion.div initial="hidden" animate="visible" variants={rv}>
            <div className="lp-badge">
              <span className="dot" />
              Bolt Cards
            </div>
          </motion.div>
          <motion.h1
            initial="hidden" animate="visible"
            variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.07 } } }}
          >
            Tap to pay. <span className="lp-accent">Lightning</span> to settle.
          </motion.h1>
          <motion.p
            className="lp-lede"
            initial="hidden" animate="visible"
            variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.14 } } }}
          >
            NFC Bolt Cards your customers hold like any bank card. They tap, Lightning routes the payment, and sats land in your bitPOS account instantly. No app required on either side.
          </motion.p>
        </section>

        {/* Card switcher */}
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2 }}
          style={{ padding: "8px 0 64px" }}
        >
          <div className="card-switch">
            <button className="cs-arrow" onClick={() => setDark(d => !d)} aria-label="Previous">&#8592;</button>
            <BoltCard dark={dark} />
            <button className="cs-arrow" onClick={() => setDark(d => !d)} aria-label="Next">&#8594;</button>
          </div>
          <div className="cs-dots" style={{ display: "flex", justifyContent: "center" }}>
            <span className={`dot ${dark ? "on" : ""}`} />
            <span className={`dot ${!dark ? "on" : ""}`} />
          </div>
        </motion.div>

        {/* How it works */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">How a tap-to-pay works.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            Four HTTP calls and one Lightning payment. Under a second, start to finish.
          </p>
          <TapToPayDiagram />
        </motion.section>

        {/* Features */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">Cards issued by bitPOS. Accepted everywhere.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            Bolt Cards follow the open LNURL-withdraw standard. A card issued by bitPOS works at any compatible terminal - Breez, BTCPay Server, VoltPay, CoinCorner - and any Bolt Card issued elsewhere works at bitPOS.
          </p>
          <ul className="fp-bullets">
            <li>NTAG424 DNA chip - cryptographic authentication on every single tap, no replay attacks</li>
            <li>Programmable spend limits per card - cap daily or per-tap amounts</li>
            <li>Universal - works at any LNURL-withdraw compatible merchant</li>
            <li>Issue to customers or program existing NTAG424 cards you already have</li>
            <li>Full tap history visible in the merchant dashboard</li>
          </ul>
          <div className="pills-wrap">
            <span className="mini-pill">NTAG424 DNA</span>
            <span className="mini-pill">LNURL-withdraw</span>
            <span className="mini-pill">Open standard</span>
            <span className="mini-pill">Spend limits</span>
            <span className="mini-pill">Replay protection</span>
            <span className="mini-pill">NFC</span>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section
          className="lp-final"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={rv}
        >
          <h2 className="lp-big">Issue your first card today.</h2>
          <p className="lp-lede">Plain white NTAG424 cards shipped to your door. Program them in the app.</p>
          <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Order Cards</a>
          <p className="final-note">
            <span style={{ color: "var(--orange)", textTransform: "uppercase", letterSpacing: ".1em" }}>Coming soon</span>
            {" "}- custom card design studio
          </p>
        </motion.section>

      </div>
    </div>
  );
}
