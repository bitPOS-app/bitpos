import { motion } from "framer-motion";

const rv = { hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };

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

export default function FeatureBox() {
  return (
    <div>
      <div className="wrap">

        {/* Hero */}
        <section className="fp-hero">
          <motion.div initial="hidden" animate="visible" variants={rv}>
            <div className="lp-badge">The Box</div>
          </motion.div>
          <motion.h1 initial="hidden" animate="visible" variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.07 } } }}>
            Purpose-built hardware for your <span className="lp-accent">counter.</span>
          </motion.h1>
          <motion.p className="lp-lede" initial="hidden" animate="visible" variants={{ ...rv, visible: { ...rv.visible, transition: { duration: 0.7, delay: 0.14 } } }}>
            A dedicated Lightning terminal with NFC built in. Set it on the counter, connect to Wi-Fi, and it is ready to accept Bolt Card taps and QR scans with no phone required.
          </motion.p>
        </section>

        {/* Device animation */}
        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2 }}
          style={{ display: "flex", justifyContent: "center", padding: "24px 0 72px" }}
        >
          <DeviceScene />
        </motion.div>

        {/* What it does */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">The full POS experience. No phone needed.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            posBOX ships pre-configured with your bitPOS account. Plug it in and it connects to your Lightning node. Customers tap or scan, the screen confirms. That is it.
          </p>
          <ul className="fp-bullets">
            <li>Dedicated NFC reader - no phone unlocking required at the counter</li>
            <li>Built-in screen shows the invoice QR and confirms payment</li>
            <li>Wi-Fi connected, runs headless - staff never touch a settings menu</li>
            <li>Accepts Bolt Card taps and standard Lightning QR scans</li>
            <li>Instant payment confirmation with green tick and amount</li>
            <li>All payments sync to your bitPOS account in real time</li>
          </ul>
        </motion.section>

        {/* Specs */}
        <motion.section
          className="fp-section"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={rv}
        >
          <h2 className="lp-mid">Built on open hardware.</h2>
          <p className="lp-lede" style={{ marginTop: "14px" }}>
            ESP32 based, running open-source bitPOS firmware. The same software that runs on the web, packaged for a dedicated terminal.
          </p>
          <div className="pills-wrap">
            <span className="mini-pill">ESP-32</span>
            <span className="mini-pill">NTAG424 NFC</span>
            <span className="mini-pill">Wi-Fi</span>
            <span className="mini-pill">HDMI display</span>
            <span className="mini-pill">Open firmware</span>
            <span className="mini-pill">Bolt Card</span>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section
          className="lp-final"
          initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={rv}
        >
          <h2 className="lp-big">A real terminal. Bitcoin only.</h2>
          <p className="lp-lede">Set it on the counter and forget about it. Lightning does the rest.</p>
          <a href="https://bitpos.app/app/" className="cta-btn cta-lg">Order the Box</a>
          <p className="final-note">
            <span style={{ color: "var(--orange)", textTransform: "uppercase", letterSpacing: ".1em" }}>Coming soon</span>
            {" "}- join the waitlist in the app
          </p>
        </motion.section>

      </div>
    </div>
  );
}
