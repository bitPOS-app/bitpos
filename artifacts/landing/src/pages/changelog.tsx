import { CheckCircle2, Circle } from "lucide-react";

const changelog = [
  {
    version: "v0.1.0",
    date: "May 24, 2026",
    title: "Initial public release",
    description: "bitPOS goes open source under AGPL-3.0. First public release covers: Lightning POS terminal, custodial NWC wallet, NTAG424 DNA Bolt Card issuance, NFC card shop, Android Card Writer app, staff PIN accounts, sales reports, and 40+ fiat price feeds. Source on GitHub, builds verifiable from the footer chip on every page.",
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