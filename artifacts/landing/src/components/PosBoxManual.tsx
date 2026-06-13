import { motion } from "framer-motion";
import { Download, Package, Cpu, Volume2, Wifi, CheckCircle2, Zap, FileCode } from "lucide-react";
import cydImg from "@/assets/cyd-board.png";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

function WiringDiagram() {
  return (
    <svg viewBox="0 0 720 460" className="w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="posBOX wiring diagram">
      <defs>
        <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f7931a" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="buzzGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
        <marker id="arrowOrange" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f7931a" />
        </marker>
      </defs>

      {/* Background */}
      <rect width="720" height="460" fill="#06060f" rx="12" />
      {/* Subtle grid */}
      {Array.from({ length: 19 }, (_, i) => (
        <line key={`gv${i}`} x1={i * 40} y1="0" x2={i * 40} y2="460" stroke="#ffffff" strokeWidth="0.3" opacity="0.035" />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <line key={`gh${i}`} x1="0" y1={i * 40} x2="720" y2={i * 40} stroke="#ffffff" strokeWidth="0.3" opacity="0.035" />
      ))}

      {/* ── WIRES (behind components) ── */}

      {/* CN1 → NFC: 4 wires (VCC red, GND gray, SDA orange, SCL yellow) */}
      {[
        { x: 256, color: "#ef4444" },
        { x: 269, color: "#64748b" },
        { x: 282, color: "#f7931a" },
        { x: 295, color: "#eab308" },
      ].map(({ x, color }, i) => (
        <g key={i}>
          <path d={`M${x},158 L${x},113`} stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx={x} cy={113} r="3" fill={color} />
          <circle cx={x} cy={158} r="3" fill={color} />
        </g>
      ))}

      {/* SPEAK → Buzzer: 2 wires */}
      <path d="M486,211 C518,211 530,228 546,228" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <circle cx={486} cy={211} r="3" fill="#22c55e" />
      <circle cx={546} cy={228} r="3" fill="#22c55e" />

      <path d="M486,223 C518,223 530,252 546,252" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <circle cx={486} cy={223} r="3" fill="#64748b" />
      <circle cx={546} cy={252} r="3" fill="#64748b" />

      {/* USB-C → Power supply */}
      <path d="M238,322 C238,365 172,378 148,390" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M252,322 C252,372 180,382 158,393" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />

      {/* ── NFC MODULE ── */}
      <rect x="196" y="20" width="215" height="94" rx="7" fill="#080f1e" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Antenna coil */}
      <rect x="206" y="32" width="56" height="56" rx="4" fill="none" stroke="#1d4ed8" strokeWidth="0.8" strokeDasharray="4,3" />
      <rect x="216" y="42" width="36" height="36" rx="3" fill="none" stroke="#1d4ed8" strokeWidth="0.8" strokeDasharray="4,3" />
      <text x="234" y="63" textAnchor="middle" fill="#1d4ed8" fontSize="7" fontFamily="monospace">ANT</text>
      {/* Chip */}
      <rect x="278" y="36" width="50" height="40" rx="3" fill="#040c1a" stroke="#1e40af" strokeWidth="0.8" />
      <text x="303" y="53" textAnchor="middle" fill="#93c5fd" fontSize="8" fontFamily="monospace" fontWeight="bold">PN532</text>
      <text x="303" y="65" textAnchor="middle" fill="#3b82f6" fontSize="6.5" fontFamily="monospace">NFC/I²C</text>
      {/* Label */}
      <text x="340" y="37" fill="#60a5fa" fontSize="10" fontFamily="monospace" fontWeight="bold">PN532 NFC MODULE</text>
      {/* Connector bar */}
      <rect x="244" y="107" width="66" height="10" rx="2" fill="#0f1e3a" stroke="#3b82f6" strokeWidth="0.8" />
      {/* Pin labels above connector */}
      {[
        { x: 253, label: "VCC", color: "#ef4444" },
        { x: 267, label: "GND", color: "#64748b" },
        { x: 279, label: "SDA", color: "#f7931a" },
        { x: 292, label: "SCL", color: "#eab308" },
      ].map(({ x, label, color }) => (
        <text key={label} x={x} y="104" fill={color} fontSize="7" fontFamily="monospace" textAnchor="middle">{label}</text>
      ))}

      {/* ── CYD BOARD ── */}
      <rect x="204" y="158" width="282" height="164" rx="8" fill="#0c1120" stroke="#f7931a" strokeWidth="2" />
      <rect x="210" y="164" width="270" height="152" rx="5" fill="none" stroke="#f7931a" strokeWidth="0.4" opacity="0.25" />
      {/* Screen */}
      <rect x="216" y="172" width="202" height="138" rx="4" fill="#050e1a" stroke="#1e3a5f" strokeWidth="1" />
      <rect x="220" y="176" width="194" height="130" rx="3" fill="url(#screenGlow)" />
      {/* Screen content hint */}
      <text x="317" y="228" textAnchor="middle" fill="#f7931a" fontSize="11" fontFamily="monospace" fontWeight="bold">₿ 0.00041</text>
      <text x="317" y="244" textAnchor="middle" fill="#4b5563" fontSize="8" fontFamily="monospace">≈ $25.00 USD</text>
      <rect x="278" y="256" width="78" height="28" rx="14" fill="#052e16" stroke="#22c55e" strokeWidth="1" />
      <text x="317" y="275" textAnchor="middle" fill="#22c55e" fontSize="9" fontFamily="monospace" fontWeight="bold">PAID ✓</text>
      {/* ESP32 chip */}
      <rect x="432" y="220" width="36" height="36" rx="3" fill="#08080f" stroke="#1e293b" strokeWidth="0.8" />
      <text x="450" y="236" textAnchor="middle" fill="#334155" fontSize="6.5" fontFamily="monospace">ESP</text>
      <text x="450" y="248" textAnchor="middle" fill="#334155" fontSize="6.5" fontFamily="monospace">32</text>
      {/* Board label */}
      <text x="456" y="278" textAnchor="middle" fill="#f7931a" fontSize="9" fontFamily="monospace" fontWeight="bold">CYD</text>
      <text x="456" y="290" textAnchor="middle" fill="#475569" fontSize="6.5" fontFamily="monospace">ESP32-2432S028R</text>
      {/* GPIO labels */}
      <text x="456" y="306" textAnchor="middle" fill="#1e293b" fontSize="6" fontFamily="monospace">2.8" 320×240 ILI9341</text>

      {/* CN1 connector on board top */}
      <rect x="244" y="149" width="62" height="12" rx="2" fill="#0f1e33" stroke="#334155" strokeWidth="0.8" />
      <text x="275" y="146" textAnchor="middle" fill="#64748b" fontSize="7.5" fontFamily="monospace">CN1</text>
      {[
        { x: 256, color: "#ef4444" },
        { x: 269, color: "#374151" },
        { x: 282, color: "#f7931a" },
        { x: 295, color: "#a16207" },
      ].map(({ x, color }, i) => (
        <rect key={i} x={x - 4} y={151} width="8" height="7" rx="1" fill={color} opacity="0.75" />
      ))}

      {/* SPEAK connector on board right side */}
      <rect x="482" y="205" width="8" height="24" rx="2" fill="#0f1e20" stroke="#1e3f24" strokeWidth="0.8" />
      <text x="494" y="211" fill="#22c55e" fontSize="7.5" fontFamily="monospace">SPEAK</text>
      <text x="494" y="222" fill="#4b5563" fontSize="6.5" fontFamily="monospace">GPIO 26</text>
      <rect x="484" y="207" width="6" height="8" rx="1" fill="#22c55e" opacity="0.7" />
      <rect x="484" y="219" width="6" height="8" rx="1" fill="#374151" opacity="0.7" />

      {/* USB-C port */}
      <rect x="222" y="319" width="38" height="10" rx="4" fill="#0f1e33" stroke="#334155" strokeWidth="0.8" />
      <text x="241" y="340" textAnchor="middle" fill="#64748b" fontSize="7.5" fontFamily="monospace">USB-C</text>

      {/* ── BUZZER ── */}
      <circle cx="594" cy="240" r="52" fill="#060e06" stroke="#22c55e" strokeWidth="1.5" />
      <circle cx="594" cy="240" r="37" fill="url(#buzzGlow)" />
      <circle cx="594" cy="240" r="37" fill="none" stroke="#15803d" strokeWidth="1" />
      <circle cx="594" cy="240" r="21" fill="#030803" stroke="#22c55e" strokeWidth="0.8" />
      <circle cx="594" cy="240" r="7" fill="#041404" stroke="#4ade80" strokeWidth="0.5" />
      {/* Sound arcs */}
      {[1, 2, 3].map(i => (
        <circle key={i} cx="594" cy="240" r={21 + i * 10} fill="none" stroke="#22c55e" strokeWidth="0.5" opacity={0.5 / i} />
      ))}
      {/* Polarity labels */}
      <text x="558" y="227" fill="#22c55e" fontSize="11" fontFamily="monospace" fontWeight="bold">+</text>
      <text x="558" y="250" fill="#64748b" fontSize="11" fontFamily="monospace" fontWeight="bold">−</text>
      {/* Input pins */}
      <rect x="544" y="222" width="8" height="12" rx="2" fill="#0a1a0a" stroke="#22c55e" strokeWidth="0.8" />
      <rect x="544" y="246" width="8" height="12" rx="2" fill="#0a1a0a" stroke="#334155" strokeWidth="0.8" />
      {/* Label */}
      <text x="594" y="310" textAnchor="middle" fill="#22c55e" fontSize="10" fontFamily="monospace" fontWeight="bold">TMB12A05</text>
      <text x="594" y="324" textAnchor="middle" fill="#6b7280" fontSize="8" fontFamily="monospace">Active Buzzer · 5V</text>

      {/* ── POWER SUPPLY ── */}
      <rect x="78" y="372" width="128" height="62" rx="6" fill="#100500" stroke="#f97316" strokeWidth="1.5" />
      <text x="142" y="394" textAnchor="middle" fill="#f97316" fontSize="10" fontFamily="monospace" fontWeight="bold">5V USB-C</text>
      <text x="142" y="409" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">Power Adapter</text>
      <text x="142" y="422" textAnchor="middle" fill="#6b7280" fontSize="7.5" fontFamily="monospace">1 A minimum · 2 A recommended</text>

      {/* ── LEGEND ── */}
      <rect x="496" y="355" width="212" height="90" rx="6" fill="#080810" stroke="#1e293b" strokeWidth="1" />
      <text x="602" y="373" textAnchor="middle" fill="#475569" fontSize="8" fontFamily="monospace" fontWeight="bold">WIRE LEGEND</text>
      {[
        { color: "#ef4444", label: "VCC / 3.3 V" },
        { color: "#64748b", label: "GND" },
        { color: "#f7931a", label: "SDA  ·  GPIO 22" },
        { color: "#eab308", label: "SCL  ·  GPIO 27" },
        { color: "#22c55e", label: "Signal  ·  GPIO 26" },
      ].map(({ color, label }, i) => (
        <g key={i}>
          <line x1="508" y1={384 + i * 12} x2="528" y2={384 + i * 12} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <text x="534" y={388 + i * 12} fill="#94a3b8" fontSize="8.5" fontFamily="monospace">{label}</text>
        </g>
      ))}

      {/* Title watermark */}
      <text x="14" y="450" fill="#1e293b" fontSize="8" fontFamily="monospace">posBOX WIRING DIAGRAM · rev 1</text>
    </svg>
  );
}

const parts = [
  {
    icon: <Cpu className="h-5 w-5" />,
    name: "ESP32-2432S028R",
    detail: "Cheap Yellow Display (CYD) - 2.8\" 320×240 touchscreen",
    note: "~$15 on AliExpress / Amazon",
    color: "text-orange-400",
    border: "border-orange-500/20",
    bg: "bg-orange-500/5",
  },
  {
    icon: <Wifi className="h-5 w-5" />,
    name: "PN532 NFC Module",
    detail: "I²C mode - SDA/SCL + VCC/GND via CN1 JST connector",
    note: "~$4 · enable I²C via DIP switches",
    color: "text-blue-400",
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
  },
  {
    icon: <Volume2 className="h-5 w-5" />,
    name: "TMB12A05 Buzzer",
    detail: "Active buzzer - plugs into onboard SPEAK JST connector",
    note: "~$1 · no extra wiring needed",
    color: "text-green-400",
    border: "border-green-500/20",
    bg: "bg-green-500/5",
  },
  {
    icon: <Package className="h-5 w-5" />,
    name: "3D-Printed Enclosure",
    detail: "Print in PLA or PETG - countertop or wall-mount ready",
    note: "Download 3MF below",
    color: "text-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
  },
];

const steps = [
  {
    n: "1",
    title: "Print the enclosure",
    body: "Print the 3MF file in PLA or PETG. 0.2 mm layer height, 15% infill. Supports not required.",
  },
  {
    n: "2",
    title: "Set the PN532 to I²C mode",
    body: "Locate the two DIP switches on the PN532 board. Set switch 1 ON, switch 2 OFF. This selects I²C.",
  },
  {
    n: "3",
    title: "Connect NFC reader to CN1",
    body: "Use the CYD's CN1 4-pin JST connector. Wire order: VCC → VCC (3.3 V), GND → GND, SDA → GPIO 22, SCL → GPIO 27.",
  },
  {
    n: "4",
    title: "Plug buzzer into SPEAK",
    body: "The TMB12A05 plugs directly into the 2-pin SPEAK JST connector. Positive (+) to pin 1 (GPIO 26), negative (−) to pin 2 (GND).",
  },
  {
    n: "5",
    title: "Flash the firmware",
    body: "Connect the CYD via USB-C, then run: git clone → pio run -t upload. The screen will show the bitPOS logo when done.",
  },
  {
    n: "6",
    title: "Provision with the bitPOS app",
    body: 'Open the bitPOS dashboard, go to Settings → Devices, and tap "Link Device". Follow the BLE setup to enter WiFi credentials and link the device to your account.',
  },
];

export default function PosBoxManual() {
  return (
    <section id="posbox" className="py-24 md:py-32 border-y border-white/5 bg-secondary/20 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">

        {/* Header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeInUp}
          className="flex flex-col items-center text-center space-y-4 mb-16"
        >
          <div className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-sm font-medium">
            <Cpu className="mr-2 h-4 w-4 text-primary" />
            Hardware Manual
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Build the posBOX.</h2>
          <p className="max-w-[600px] text-muted-foreground md:text-xl">
            A $20 always-on payment terminal. Flash once, run forever.
            Reads Bolt Cards, confirms payments, beeps on success.
          </p>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <a
              href="/posbox-enclosure.3mf"
              download
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground shadow transition-all hover:bg-primary/90 hover:scale-105"
            >
              <Download className="h-4 w-4" />
              Download 3MF
            </a>
            <a
              href="https://github.com/bitPOS-app/bitpos/tree/main/artifacts/esp32-pos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-background px-5 text-sm font-medium transition-colors hover:bg-accent"
            >
              <FileCode className="h-4 w-4" />
              Firmware source
            </a>
          </div>
        </motion.div>

        {/* CYD photo + parts list */}
        <div className="grid gap-10 lg:grid-cols-2 items-start mb-16 max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl overflow-hidden border border-white/10 bg-card shadow-2xl"
          >
            <img
              src={cydImg}
              alt="ESP32-2432S028R Cheap Yellow Display (CYD)"
              className="w-full object-cover"
            />
            <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">ESP32-2432S028R · 240 MHz · 320×240 ILI9341 · XPT2046 touch</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="space-y-3"
          >
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Parts list</h3>
            {parts.map((p) => (
              <div key={p.name} className={`rounded-xl border ${p.border} ${p.bg} p-4 flex gap-4 items-start`}>
                <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 ${p.color}`}>
                  {p.icon}
                </div>
                <div>
                  <p className={`font-semibold text-sm ${p.color}`}>{p.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{p.detail}</p>
                  <p className="text-xs text-white/30 mt-1 font-mono">{p.note}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Wiring diagram */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="max-w-5xl mx-auto mb-16"
        >
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-5">Wiring diagram</h3>
          <div className="rounded-2xl overflow-hidden border border-white/8 bg-[#06060f] shadow-2xl">
            <WiringDiagram />
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center font-mono">
            CN1 and SPEAK are JST-PH 1.25mm connectors on the CYD board · PN532 DIP: SW1=ON SW2=OFF for I²C
          </p>
        </motion.div>

        {/* Assembly steps */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
          className="max-w-3xl mx-auto"
        >
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6">Assembly steps</h3>
          <div className="space-y-4">
            {steps.map((s) => (
              <motion.div
                key={s.n}
                variants={fadeInUp}
                className="flex gap-5 items-start rounded-xl border border-white/5 bg-card px-5 py-4"
              >
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-sm">
                  {s.n}
                </div>
                <div>
                  <p className="font-semibold text-sm mb-1">{s.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Done state */}
          <motion.div
            variants={fadeInUp}
            className="mt-8 rounded-xl border border-green-500/20 bg-green-500/5 px-6 py-5 flex items-start gap-4"
          >
            <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-green-500/15 border border-green-500/25 text-green-400">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-green-400 mb-1">You're live.</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The posBOX polls the bitPOS API every 5 seconds. When a Bolt Card taps the PN532,
                it authenticates and settles over Lightning - the screen shows PAID and the buzzer confirms it.
                No further setup needed.
              </p>
            </div>
          </motion.div>
        </motion.div>

      </div>
    </section>
  );
}
