import { Link } from "wouter";
import { motion } from "framer-motion";

const rv = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };

export default function FeatureApp() {
  return (
    <div>
      <div className="wrap">

        {/* Hero */}
        <section className="fp-hero">
          <motion.div initial="hidden" animate="visible" variants={rv}>
            <div className="lp-badge">
              <span className="dot" />
              The App
            </div>
          </motion.div>
          <motion.h1 initial="hidden" animate="visible" variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.07 } } }}>
            Your POS lives in a <span className="lp-accent">URL.</span>
          </motion.h1>
          <motion.p className="lp-lede" initial="hidden" animate="visible" variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.14 } } }}>
            Open a tab, start taking payments. No app store, no card reader to pair, no software to install. bitPOS runs in any browser, on any device.
          </motion.p>
          <motion.div initial="hidden" animate="visible" variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.2 } } }}>
            <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Launch App</a>
          </motion.div>
        </section>

        {/* Phone mockup */}
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}
          style={{ display: "flex", justifyContent: "center", padding: "0 0 64px" }}
        >
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
                {["1","2","3","4","5","6","7","8","9"].map((k, i) => (
                  <div key={k} className={`key${k==="4"?" k4":k==="2"?" k2":""}`}>{k}</div>
                ))}
                <div className="key blank" />
                <div className="key k0">0</div>
                <div className="key bs">
                  <svg viewBox="0 0 24 24"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg>
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
                  <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <div className="msg">Payment received</div>
                <div className="sub">4,200 sats settled</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* What it does */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">Everything a POS needs. Nothing it does not.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            Create an account, open the app, enter an amount. Your customer scans the QR and pays, sats arrive instantly.
          </p>
          <ul className="fp-bullets">
            <li>Sats and fiat display side by side - quote in any of 40+ currency denominations, settle in Lightning</li>
            <li>Invoices generated instantly with no previous node setup necessary.</li>
            <li>Every payment logged with amount, status, and timestamp</li>
            <li>Self-custodial sweep - move your balance to your own lightning wallet at any time</li>
            <li>Runs on the same device your staff already uses, no dedicated hardware required</li>
          </ul>
        </motion.section>

        {/* Technical */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">Open source. Auditable. Always.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            Every build ships with the git commit that produced it. Click the version tag in the footer to verify the source. Licensed under AGPL-3.0 - anyone can verify what is running.
          </p>
          <div className="pills-wrap">
            <span className="mini-pill">AGPL-3.0</span>
            <span className="mini-pill">Lightning Network</span>
            <span className="mini-pill">LNURL</span>
            <span className="mini-pill">WebNFC</span>
            <span className="mini-pill">Self-custodial</span>
            <span className="mini-pill">Instant settlement</span>
          </div>
        </motion.section>

        {/* Final CTA */}
        <motion.section
          className="lp-final"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={rv}
        >
          <h2 className="lp-big">Accept your first payment in under a minute.</h2>
          <p className="lp-lede">No hardware. No waiting. Just a URL and a browser.</p>
          <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Launch App</a>
          <p className="final-note">No signup fee. 0% fee on in-network payments.</p>
        </motion.section>

      </div>
    </div>
  );
}
