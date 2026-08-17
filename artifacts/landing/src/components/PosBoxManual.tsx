import { Download, FileCode, Zap } from "lucide-react";

/* ── Wiring table data ── */
const wires = [
  { color: "#ef4444", label: "VCC", from: "PN532 VCC", to: "CYD CN1 pin 1", note: "3.3V" },
  { color: "#64748b", label: "GND", from: "PN532 GND", to: "CYD CN1 pin 2", note: "Common ground" },
  { color: "#f7931a", label: "SDA", from: "PN532 SDA", to: "CYD GPIO 22", note: "I2C data" },
  { color: "#eab308", label: "SCL", from: "PN532 SCL", to: "CYD GPIO 27", note: "I2C clock" },
];

const parts = [
  { name: "CYD (ESP32-2432S028R)", price: "~$12", note: "2.4\" ILI9341 touchscreen, 320×240, XPT2046 touch, ESP32-D0WDQ6" },
  { name: "PN532 NFC Module", price: "~$5", note: "I2C mode (SW1=ON, SW2=OFF). Reads NTAG424 DNA Bolt Cards." },
  { name: "TMB12A05 Buzzer", price: "~$1", note: "Plugs into CYD SPEAK connector. No extra wiring." },
  { name: "3D-Printed Enclosure", price: "Free", note: "Print in PLA/PETG, 0.2mm layers, 15% infill, no supports." },
];

const steps = [
  {
    n: "1",
    title: "Get the parts",
    body: "Order a CYD (ESP32-2432S028R) and a PN532 NFC module from AliExpress, Amazon, or your local electronics shop. Total cost: ~$18.",
  },
  {
    n: "2",
    title: "Set the PN532 to I2C mode",
    body: "On the PN532 board, find the two DIP switches. Set switch 1 to ON, switch 2 to OFF. This selects I2C communication.",
  },
  {
    n: "3",
    title: "Wire the NFC reader",
    body: "Connect 4 wires from the PN532 to the CYD's CN1 connector: VCC→3.3V, GND→GND, SDA→GPIO22, SCL→GPIO27. The buzzer plugs directly into the SPEAK connector.",
  },
  {
    n: "4",
    title: "Flash the firmware",
    body: "Plug the CYD via USB-C into your computer. Open Chrome or Edge, go to bitpos.app/app/business/pos-box, click Flash Device, and select the COM port. The webflasher does the rest — no coding required.",
  },
  {
    n: "5",
    title: "Link the device",
    body: "After flashing, go to bitpos.app/app/business/pos-box and click Link Device. The device is discoverable via Bluetooth — select it, enter your WiFi credentials, and it links to your account.",
  },
  {
    n: "6",
    title: "Issue Bolt Cards",
    body: "On the device, tap the gear icon → Issue Card. Create a card on bitpos.app first, then tap a blank NTAG424 card on the device to write it. You're live — tap to pay.",
  },
];

export default function PosBoxManual() {
  return (
    <div className="mx-auto max-w-[960px] px-5 py-16 sm:px-8">

        {/* Header */}
        <div className="mb-12">
          <p className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.18em] text-[#F7931A] mb-2">
            [ DIY BUILD GUIDE ]
          </p>
          <h2 className="font-['Ubuntu'] text-3xl font-bold text-white sm:text-4xl">
            Build your own posBOX
          </h2>
          <p className="mt-4 max-w-[560px] font-['Ubuntu'] text-[15px] leading-relaxed text-white/50">
            A $20 Bitcoin payment terminal you assemble from off-the-shelf parts.
            Tap-to-pay NFC, Lightning settlement, no phone needed.
            Open firmware, open hardware.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/posbox-enclosure.3mf"
              download
              className="inline-flex items-center gap-2 rounded-md bg-[#F7931A] px-5 py-2.5 font-['Ubuntu'] text-[13px] font-bold text-[#0B0C0E] transition-transform hover:-translate-y-px"
            >
              <Download className="h-4 w-4" />
              Download enclosure (3MF)
            </a>
            <a
              href="https://github.com/bitPOS-app/bitpos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[#F7931A]/40 px-5 py-2.5 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              <FileCode className="h-4 w-4" />
              Firmware source
            </a>
            <a
              href="https://maekob.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[#F7931A]/40 px-5 py-2.5 font-['Ubuntu_Mono'] text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              Buy pre-assembled →
            </a>
          </div>
        </div>

        {/* Parts list */}
        <div className="mb-12">
          <h3 className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.18em] text-white/40 mb-4">
            [ PARTS LIST ]
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {parts.map((p) => (
              <div key={p.name} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-['Ubuntu'] text-sm font-bold text-white">{p.name}</span>
                  <span className="font-['Ubuntu_Mono'] text-xs text-[#F7931A]">{p.price}</span>
                </div>
                <p className="mt-1.5 font-['Ubuntu'] text-xs text-white/40 leading-relaxed">{p.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Wiring table */}
        <div className="mb-12">
          <h3 className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.18em] text-white/40 mb-4">
            [ WIRING — PN532 → CYD CN1 ]
          </h3>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full font-['Ubuntu_Mono'] text-xs">
              <thead className="bg-white/5">
                <tr className="text-white/40">
                  <th className="px-4 py-2 text-left">Wire</th>
                  <th className="px-4 py-2 text-left">From</th>
                  <th className="px-4 py-2 text-left">To</th>
                  <th className="px-4 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {wires.map((w) => (
                  <tr key={w.label} className="border-t border-white/5">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: w.color }} />
                        <span className="text-white">{w.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-white/60">{w.from}</td>
                    <td className="px-4 py-2.5 text-white/60">{w.to}</td>
                    <td className="px-4 py-2.5 text-white/40">{w.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-['Ubuntu_Mono'] text-[10px] text-white/30">
            Buzzer plugs into CYD SPEAK connector (no wiring needed) · PN532 DIP: SW1=ON SW2=OFF for I2C
          </p>
        </div>

        {/* Assembly steps */}
        <div className="mb-12">
          <h3 className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.18em] text-white/40 mb-4">
            [ ASSEMBLY ]
          </h3>
          <div className="space-y-3">
            {steps.map((s) => (
              <div key={s.n} className="flex gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-5 py-4">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[#F7931A]/30 bg-[#F7931A]/10 font-['Ubuntu'] text-sm font-bold text-[#F7931A]">
                  {s.n}
                </div>
                <div>
                  <p className="font-['Ubuntu'] text-sm font-bold text-white">{s.title}</p>
                  <p className="mt-1 font-['Ubuntu'] text-[13px] text-white/50 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Done */}
        <div className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/5 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="font-['Ubuntu'] text-sm font-bold text-[#22c55e]">You're live.</p>
              <p className="mt-1 font-['Ubuntu'] text-[13px] text-white/50 leading-relaxed">
                Customers tap Bolt Cards on the device. Lightning settles instantly.
                The screen shows PAID and the buzzer confirms it. No phone needed at the counter.
              </p>
            </div>
          </div>
        </div>

      </div>
  );
}
