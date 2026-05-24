import { CheckCircle2, Circle } from "lucide-react";

const changelog = [
  {
    version: "v0.9.4",
    date: "May 10, 2026",
    title: "Advanced Analytics & Reporting",
    description: "Added comprehensive charting for daily, weekly, and monthly revenue. You can now export reports as CSV.",
    type: "feature"
  },
  {
    version: "v0.9.0",
    date: "March 22, 2026",
    title: "Staff Roles & Restricted Views",
    description: "Introduced PIN-protected staff accounts. Staff can generate invoices and see current shift totals, but cannot access settings, view historical data, or initiate outbound payments.",
    type: "feature"
  },
  {
    version: "v0.8.5",
    date: "January 14, 2026",
    title: "Bolt Card Overhaul",
    description: "Rewrote the NFC writing logic from scratch for better compatibility with standard NTAG424 DNA tags. Writing a new card is now 3x faster.",
    type: "update"
  },
  {
    version: "v0.8.1",
    date: "November 03, 2025",
    title: "Fiat Price Feeds",
    description: "Added support for 40+ fiat currencies. Prices update in real-time. Added fallback logic if primary price oracle fails.",
    type: "update"
  },
  {
    version: "v0.7.0",
    date: "September 18, 2025",
    title: "NWC (Nostr Wallet Connect) Support",
    description: "Fully deprecated legacy connection methods in favor of NWC. This provides a vastly superior, standardized connection flow for self-custodial nodes.",
    type: "feature"
  },
  {
    version: "v0.6.2",
    date: "August 05, 2025",
    title: "Initial Public Release",
    description: "First public beta of bitPOS. Basic point-of-sale functionality, LNDhub support, and invoice generation.",
    type: "release"
  }
];

export default function Changelog() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
      <div className="mb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Changelog</h1>
        <p className="text-xl text-muted-foreground">New updates and improvements to bitPOS.</p>
      </div>

      <div className="relative border-l border-white/10 ml-4 md:ml-8 space-y-12 pb-12">
        {changelog.map((item, i) => (
          <div key={i} className="relative pl-8 md:pl-12">
            <div className="absolute -left-3 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-white/20">
              {item.type === "release" ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-3 w-3 text-muted-foreground fill-muted-foreground/20" />
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-3">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {item.version}
              </span>
              <span className="text-sm font-mono text-muted-foreground">
                {item.date}
              </span>
            </div>
            
            <h3 className="text-xl font-bold mb-2">{item.title}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}