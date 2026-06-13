import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

const rv = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };

function PhoneMockup() {
  return (
    <div className="phone">
      <div className="phone-screen">
        <div className="notch" />
        <div className="app-head">
          <svg className="bk" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Point of Sale
        </div>
        <div className="lp-toggle">
          <span className="on">SATS</span>
          <span>USD</span>
        </div>
        <div className="amount">
          <div className="amt-stack">
            <b className="a0">0</b>
            <b className="a1">4</b>
            <b className="a2">42</b>
            <b className="a3">420</b>
            <b className="a4">4,200</b>
          </div>
        </div>
        <div className="unit">sats</div>
        <div className="keypad">
          <div className="key">1</div>
          <div className="key k2">2</div>
          <div className="key">3</div>
          <div className="key k4">4</div>
          <div className="key">5</div>
          <div className="key">6</div>
          <div className="key">7</div>
          <div className="key">8</div>
          <div className="key">9</div>
          <div className="key blank" />
          <div className="key k0">0</div>
          <div className="key bs">
            <svg viewBox="0 0 24 24">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          </div>
        </div>
        <div className="charge">
          <b className="be">Enter an amount</b>
          <b className="bc">Charge 4,200 sats</b>
        </div>
        <div className="invoice">
          <div className="inv-head">Lightning Invoice</div>
          <div className="inv-qr">
            <svg className="qr" viewBox="0 0 25 25" shapeRendering="crispEdges">
              <rect x="0" y="0" width="7" height="1"/><rect x="12" y="0" width="1" height="1"/><rect x="15" y="0" width="2" height="1"/><rect x="18" y="0" width="7" height="1"/>
              <rect x="0" y="1" width="1" height="1"/><rect x="6" y="1" width="1" height="1"/><rect x="9" y="1" width="3" height="1"/><rect x="18" y="1" width="1" height="1"/><rect x="24" y="1" width="1" height="1"/>
              <rect x="0" y="2" width="1" height="1"/><rect x="2" y="2" width="3" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="8" y="2" width="1" height="1"/><rect x="12" y="2" width="3" height="1"/><rect x="18" y="2" width="1" height="1"/><rect x="20" y="2" width="3" height="1"/><rect x="24" y="2" width="1" height="1"/>
              <rect x="0" y="3" width="1" height="1"/><rect x="2" y="3" width="3" height="1"/><rect x="6" y="3" width="1" height="1"/><rect x="10" y="3" width="1" height="1"/><rect x="13" y="3" width="4" height="1"/><rect x="18" y="3" width="1" height="1"/><rect x="20" y="3" width="3" height="1"/><rect x="24" y="3" width="1" height="1"/>
              <rect x="0" y="4" width="1" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/><rect x="10" y="4" width="1" height="1"/><rect x="12" y="4" width="2" height="1"/><rect x="18" y="4" width="1" height="1"/><rect x="20" y="4" width="3" height="1"/><rect x="24" y="4" width="1" height="1"/>
              <rect x="0" y="5" width="1" height="1"/><rect x="6" y="5" width="1" height="1"/><rect x="9" y="5" width="1" height="1"/><rect x="12" y="5" width="2" height="1"/><rect x="15" y="5" width="1" height="1"/><rect x="18" y="5" width="1" height="1"/><rect x="24" y="5" width="1" height="1"/>
              <rect x="0" y="6" width="7" height="1"/><rect x="8" y="6" width="1" height="1"/><rect x="10" y="6" width="1" height="1"/><rect x="12" y="6" width="1" height="1"/><rect x="14" y="6" width="1" height="1"/><rect x="16" y="6" width="1" height="1"/><rect x="18" y="6" width="7" height="1"/>
              <rect x="11" y="7" width="1" height="1"/><rect x="13" y="7" width="1" height="1"/><rect x="15" y="7" width="1" height="1"/>
              <rect x="0" y="8" width="1" height="1"/><rect x="3" y="8" width="1" height="1"/><rect x="6" y="8" width="1" height="1"/><rect x="9" y="8" width="1" height="1"/><rect x="11" y="8" width="4" height="1"/><rect x="16" y="8" width="1" height="1"/><rect x="18" y="8" width="4" height="1"/><rect x="23" y="8" width="2" height="1"/>
              <rect x="1" y="9" width="1" height="1"/><rect x="3" y="9" width="3" height="1"/><rect x="7" y="9" width="1" height="1"/><rect x="9" y="9" width="1" height="1"/><rect x="11" y="9" width="3" height="1"/><rect x="17" y="9" width="1" height="1"/><rect x="19" y="9" width="3" height="1"/><rect x="24" y="9" width="1" height="1"/>
              <rect x="0" y="10" width="1" height="1"/><rect x="2" y="10" width="1" height="1"/><rect x="4" y="10" width="3" height="1"/><rect x="8" y="10" width="1" height="1"/><rect x="14" y="10" width="3" height="1"/><rect x="19" y="10" width="1" height="1"/>
              <rect x="1" y="11" width="3" height="1"/><rect x="7" y="11" width="1" height="1"/><rect x="10" y="11" width="3" height="1"/><rect x="14" y="11" width="1" height="1"/><rect x="16" y="11" width="1" height="1"/><rect x="19" y="11" width="2" height="1"/><rect x="24" y="11" width="1" height="1"/>
              <rect x="0" y="12" width="2" height="1"/><rect x="6" y="12" width="1" height="1"/><rect x="8" y="12" width="2" height="1"/><rect x="11" y="12" width="2" height="1"/><rect x="14" y="12" width="1" height="1"/><rect x="16" y="12" width="1" height="1"/><rect x="19" y="12" width="1" height="1"/><rect x="21" y="12" width="1" height="1"/><rect x="23" y="12" width="2" height="1"/>
              <rect x="2" y="13" width="2" height="1"/><rect x="8" y="13" width="5" height="1"/><rect x="20" y="13" width="2" height="1"/><rect x="23" y="13" width="2" height="1"/>
              <rect x="2" y="14" width="1" height="1"/><rect x="4" y="14" width="1" height="1"/><rect x="6" y="14" width="1" height="1"/><rect x="9" y="14" width="1" height="1"/><rect x="12" y="14" width="1" height="1"/><rect x="15" y="14" width="1" height="1"/><rect x="18" y="14" width="2" height="1"/><rect x="21" y="14" width="1" height="1"/><rect x="23" y="14" width="2" height="1"/>
              <rect x="3" y="15" width="1" height="1"/><rect x="10" y="15" width="1" height="1"/><rect x="12" y="15" width="1" height="1"/><rect x="15" y="15" width="2" height="1"/><rect x="19" y="15" width="1" height="1"/><rect x="22" y="15" width="1" height="1"/><rect x="24" y="15" width="1" height="1"/>
              <rect x="1" y="16" width="2" height="1"/><rect x="4" y="16" width="8" height="1"/><rect x="13" y="16" width="2" height="1"/><rect x="16" y="16" width="8" height="1"/>
              <rect x="8" y="17" width="1" height="1"/><rect x="10" y="17" width="4" height="1"/><rect x="16" y="17" width="1" height="1"/><rect x="20" y="17" width="1" height="1"/><rect x="22" y="17" width="2" height="1"/>
              <rect x="0" y="18" width="7" height="1"/><rect x="10" y="18" width="1" height="1"/><rect x="12" y="18" width="3" height="1"/><rect x="16" y="18" width="1" height="1"/><rect x="18" y="18" width="1" height="1"/><rect x="20" y="18" width="1" height="1"/><rect x="22" y="18" width="1" height="1"/>
              <rect x="0" y="19" width="1" height="1"/><rect x="6" y="19" width="1" height="1"/><rect x="9" y="19" width="1" height="1"/><rect x="14" y="19" width="3" height="1"/><rect x="20" y="19" width="1" height="1"/><rect x="22" y="19" width="1" height="1"/><rect x="24" y="19" width="1" height="1"/>
              <rect x="0" y="20" width="1" height="1"/><rect x="2" y="20" width="3" height="1"/><rect x="6" y="20" width="1" height="1"/><rect x="12" y="20" width="2" height="1"/><rect x="15" y="20" width="6" height="1"/><rect x="22" y="20" width="1" height="1"/>
              <rect x="0" y="21" width="1" height="1"/><rect x="2" y="21" width="3" height="1"/><rect x="6" y="21" width="1" height="1"/><rect x="8" y="21" width="1" height="1"/><rect x="10" y="21" width="2" height="1"/><rect x="13" y="21" width="4" height="1"/><rect x="22" y="21" width="1" height="1"/><rect x="24" y="21" width="1" height="1"/>
              <rect x="0" y="22" width="1" height="1"/><rect x="2" y="22" width="3" height="1"/><rect x="6" y="22" width="1" height="1"/><rect x="11" y="22" width="1" height="1"/><rect x="13" y="22" width="1" height="1"/><rect x="16" y="22" width="8" height="1"/>
              <rect x="0" y="23" width="1" height="1"/><rect x="6" y="23" width="1" height="1"/><rect x="8" y="23" width="1" height="1"/><rect x="10" y="23" width="2" height="1"/><rect x="14" y="23" width="1" height="1"/><rect x="18" y="23" width="2" height="1"/>
              <rect x="0" y="24" width="7" height="1"/><rect x="8" y="24" width="1" height="1"/><rect x="12" y="24" width="1" height="1"/><rect x="16" y="24" width="3" height="1"/><rect x="20" y="24" width="5" height="1"/>
              <rect x="1" y="1" width="5" height="5" fill="#f3ebe3"/><rect x="19" y="1" width="5" height="5" fill="#f3ebe3"/><rect x="1" y="19" width="5" height="5" fill="#f3ebe3"/>
              <rect x="2" y="2" width="3" height="3"/><rect x="20" y="2" width="3" height="3"/><rect x="2" y="20" width="3" height="3"/>
              <rect x="17" y="17" width="3" height="3" fill="#f3ebe3"/><rect x="18" y="18" width="1" height="1"/>
            </svg>
          </div>
          <div className="inv-amt">4,200 <span>SATS</span></div>
          <div className="inv-usd">~ $2.94 USD</div>
          <div className="inv-wait">
            <span className="d" /><span className="d" /><span className="d" />
            Awaiting payment
          </div>
        </div>
        <div className="success">
          <div className="ring">
            <svg viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="msg">Payment received</div>
          <div className="sub">4,200 sats settled</div>
        </div>
      </div>
    </div>
  );
}

function DeviceScene() {
  return (
    <div className="scene">
      <div className="device-wrap lp-float">
        <div className="device">
          <div className="top">
            <div className="box-brand">
              <div className="bmark">
                <svg viewBox="0 0 24 24">
                  <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                </svg>
              </div>
              <div className="wm">
                bit<span className="pos">POS</span>
              </div>
            </div>
          </div>
          <div className="body">
            <div className="screen">
              <div className="scr-layer scr-idle">
                <div className="amt">4,200</div>
                <div className="tap">Tap card to pay</div>
              </div>
              <div className="scr-layer scr-paid">
                <div className="chk">
                  <svg viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="pd">Paid</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ripples">
        <div className="ring2d" />
        <div className="ring2d r2" />
      </div>
      <div className="card-fly">
        <div className="c-nfc">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ea7c1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 12a8 8 0 0 0-8-8" />
            <path d="M4 12a8 8 0 0 0 8 8" />
            <path d="M16 12a4 4 0 0 0-4-4" />
            <path d="M8 12a4 4 0 0 0 4 4" />
          </svg>
        </div>
        <div className="c-name">BOLT CARD</div>
        <div className="c-strip" />
      </div>
    </div>
  );
}

function BoltCardDark() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>
      <div className="bcard dark">
        <div className="bc-brand">
          <span className="bit">bit</span><span className="pos">POS</span>
        </div>
        <div className="bc-bolt">
          <svg viewBox="0 0 24 24">
            <path fill="#ea7c1e" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
          </svg>
        </div>
        <div className="bc-url">BITPOS.APP</div>
      </div>
      <a
        href="https://bitpos.app/app/card-studio"
        className="text-[18px]"
        style={{
          fontFamily: "var(--lp-display)",
          fontWeight: 600,
          color: "var(--orange)",
          textAlign: "center",
          textDecoration: "none",
          display: "inline-block",
          transition: "opacity .2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        Design your custom card in The Card Studio
      </a>
    </div>
  );
}

const SLIDES = [
  { key: "app",    label: "The App",    Component: PhoneMockup, duration: 7000 },
  { key: "device", label: "The Box",    Component: DeviceScene, duration: 4000 },
  { key: "cards",  label: "Bolt Cards", Component: BoltCardDark, duration: 4000 },
] as const;

const FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.6 } };

function HeroCycle() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setIdx(i => (i + 1) % SLIDES.length), SLIDES[idx].duration);
    return () => clearTimeout(t);
  }, [idx]);

  const { key, Component } = SLIDES[idx];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", minHeight: "480px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatePresence mode="wait">
          <motion.div key={key} {...FADE} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Component />
          </motion.div>
        </AnimatePresence>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "16px", marginBottom: "8px" }}>
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setIdx(i)}
            aria-label={s.label}
            style={{
              width: i === idx ? "22px" : "7px",
              height: "7px",
              borderRadius: "4px",
              background: i === idx ? "var(--orange, #ea7c1e)" : "rgba(255,255,255,.25)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width .3s, background .3s",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: "4px" }}>
        {SLIDES[idx].label}
      </div>
    </div>
  );
}

const TEASERS = [
  {
    badge: "The App",
    title: "Your POS in any browser.",
    body: "Generate Lightning invoices from any device - no installs or hardware required. Open a tab, enter an amount, show the QR. Done.",
    cta: "Learn more",
    href: "/features/app",
  },
  {
    badge: "The Box",
    title: "Purpose-built for the counter.",
    body: "A dedicated physical NFC terminal box that sits on the counter and supports Bolt Card tap-to-pay capability, no phone required.",
    cta: "Learn more",
    href: "/features/box",
  },
  {
    badge: "Bolt Cards",
    title: "Tap-to-pay over Lightning.",
    body: "Issue NFC cards your customers tap-to-pay just like legacy payment card. Cryptographic authentication on every tap. Seconds to settle.",
    cta: "Order Cards",
    href: "/features/cards",
  },
];

const TRUST = [
  {
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Non-custodial sweep",
    body: "Move your balance to any Lightning wallet or on-chain address at any time.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
      </svg>
    ),
    title: "Open source",
    body: "AGPL-3.0. Every build ships with the commit that produced it. Read the code, verify what is running.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: "Instant settlement",
    body: "Lightning payments confirm in under a second. No chargebacks, no reversals, no waiting on a processor.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "Lightning native",
    body: "Built on the Lightning Network from the ground up. Not bolted onto a legacy rails system.",
  },
];

export default function Home() {
  return (
    <div>

      {/* HERO */}
      <section className="lp-hero">
        <div className="wrap" style={{ width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <motion.h1
              initial="hidden" animate="visible"
              variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay: 0.08 } } }}
              style={{ textAlign: "center", marginTop: "26px" }}
            >
              The Bitcoin point-of-sale{" "}
              <span className="lp-accent">in your pocket.</span>
            </motion.h1>

            <motion.p
              className="lp-lede"
              initial="hidden" animate="visible"
              variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay: 0.15 } } }}
              style={{ textAlign: "center", maxWidth: "560px", margin: "20px auto 0" }}
            >
              Open a bitPOS Lightning account and start accepting Bitcoin payments from anyone, right in your phone's web browser. Nothing to install, no bank to wait on. Sats land in your account instantly.
            </motion.p>

            <motion.div
              initial="hidden" animate="visible"
              variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay: 0.22 } } }}
            >
              <HeroCycle />
            </motion.div>

            <motion.div
              initial="hidden" animate="visible"
              variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, delay: 0.3 } } }}
            >
              <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Launch App</a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURE TEASERS */}
      <section className="lp-teasers">
        <div className="wrap">
          <div className="lp-teasers-grid">
            {TEASERS.map((t, i) => (
              <motion.div
                key={t.href}
                className="lp-teaser"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1 } } }}
              >
                <div className="lp-badge" style={{ alignSelf: "flex-start", marginBottom: "4px" }}>{t.badge}</div>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
                <Link href={t.href} className="outline-btn">{t.cta} &rarr;</Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="lp-trust">
        <div className="wrap">
          <div className="lp-trust-grid">
            {TRUST.map((item, i) => (
              <motion.div
                key={item.title}
                className="lp-trust-item"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.08 } } }}
              >
                <div className="lp-trust-ic">{item.icon}</div>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON TEASER */}
      <section style={{ padding: "0 0 16px" }}>
        <div className="wrap">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={rv}
          >
            <Link href="/comparison" style={{ display: "block", textDecoration: "none" }}>
              <div style={{
                background: "rgba(239,68,68,.06)",
                border: "1px solid rgba(239,68,68,.2)",
                borderRadius: "16px",
                padding: "28px 32px",
                display: "flex",
                alignItems: "center",
                gap: "24px",
                cursor: "pointer",
                transition: "border-color .2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(239,68,68,.45)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(239,68,68,.2)")}
              >
                <div style={{ fontSize: "40px", flexShrink: 0 }}>&#128561;</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#ef4444", marginBottom: "6px" }}>
                    Wait - what?
                  </div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: "rgba(255,255,255,.9)", marginBottom: "6px", lineHeight: 1.3 }}>
                    Legacy cards put your private-key on the card and ask you to hand it to strangers.
                  </div>
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,.5)" }}>
                    Bolt Cards vs Legacy Credit Cards: a cryptography lesson &rarr;
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final">
        <div className="wrap">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={rv}
            style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <h2 className="lp-big">Ready to accept your first payment?</h2>
            <p className="lp-lede" style={{ textAlign: "center", margin: "18px auto 36px" }}>
              No hardware required. No bank account needed. Just a browser and a Lightning address.
            </p>
            <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Launch App</a>
            <p className="final-note">Open source. AGPL-3.0. Don't trust, verify.</p>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
