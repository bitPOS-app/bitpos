import { useQuery } from "@tanstack/react-query";
import { BlueprintShell } from "@/components/blueprint";

type ServiceStatus = "operational" | "degraded" | "down" | "loading";

interface Service {
  name: string;
  description: string;
  status: ServiceStatus;
  checkedAt?: Date;
}

function Dot({ status }: { status: ServiceStatus }) {
  if (status === "loading") {
    return (
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/30" />
    );
  }
  if (status === "operational") {
    return <span className="inline-block h-2 w-2 rounded-full bg-[#39d98a] shadow-[0_0_6px_rgba(57,217,138,0.7)]" />;
  }
  if (status === "degraded") {
    return <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.7)]" />;
  }
  return <span className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />;
}

function StatusLabel({ status }: { status: ServiceStatus }) {
  if (status === "loading") {
    return (
      <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-white/40">
        Checking...
      </span>
    );
  }
  if (status === "operational") {
    return (
      <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-[#39d98a]">
        Operational
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-yellow-400">
        Degraded
      </span>
    );
  }
  return (
    <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-red-500">
      Down
    </span>
  );
}

function OverallBanner({ services }: { services: Service[] }) {
  const anyLoading = services.some((s) => s.status === "loading");
  const anyDown = services.some((s) => s.status === "down");
  const anyDegraded = services.some((s) => s.status === "degraded");

  if (anyLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white/30" />
        <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] text-white/50">
          Checking systems...
        </span>
      </div>
    );
  }
  if (anyDown) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5">
        <span className="inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
        <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] text-red-500">
          Service Disruption
        </span>
      </div>
    );
  }
  if (anyDegraded) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-yellow-400/25 bg-yellow-400/[0.07] px-4 py-2.5">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.7)]" />
        <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] text-yellow-400">
          Partial Outage
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-[#39d98a]/25 bg-[#39d98a]/[0.07] px-4 py-2.5">
      <span className="inline-block h-2 w-2 rounded-full bg-[#39d98a] shadow-[0_0_6px_rgba(57,217,138,0.7)]" />
      <span className="font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.16em] text-[#39d98a]">
        All Systems Operational
      </span>
    </div>
  );
}

export default function Status() {
  const apiHealth = useQuery({
    queryKey: ["status-api"],
    queryFn: async () => {
      const res = await fetch("/api/healthz");
      if (!res.ok) throw new Error("unhealthy");
      const json = await res.json();
      if (json.status !== "ok") throw new Error("unhealthy");
      return json;
    },
    retry: 1,
    refetchInterval: 60_000,
  });

  const priceHealth = useQuery({
    queryKey: ["status-price"],
    queryFn: async () => {
      const res = await fetch("/api/price");
      if (!res.ok) throw new Error("unavailable");
      return res.json();
    },
    retry: 1,
    refetchInterval: 60_000,
  });

  function resolveApiStatus(query: typeof apiHealth): ServiceStatus {
    if (query.isPending) return "loading";
    if (query.isError) return "down";
    return "operational";
  }

  function resolvePriceStatus(query: typeof priceHealth): ServiceStatus {
    if (query.isPending) return "loading";
    if (query.isError) return "degraded";
    return "operational";
  }

  const services: Service[] = [
    {
      name: "API Server",
      description: "Core backend - accounts, invoices, authentication",
      status: resolveApiStatus(apiHealth),
      checkedAt: apiHealth.dataUpdatedAt
        ? new Date(apiHealth.dataUpdatedAt)
        : apiHealth.errorUpdatedAt
          ? new Date(apiHealth.errorUpdatedAt)
          : undefined,
    },
    {
      name: "Price Oracle",
      description: "Real-time BTC/fiat exchange rates",
      status: resolvePriceStatus(priceHealth),
      checkedAt: priceHealth.dataUpdatedAt
        ? new Date(priceHealth.dataUpdatedAt)
        : priceHealth.errorUpdatedAt
          ? new Date(priceHealth.errorUpdatedAt)
          : undefined,
    },
    {
      name: "Lightning Payments (NWC)",
      description: "Outbound and inbound Lightning payment processing - not actively probed",
      status: "operational",
    },
    {
      name: "Bolt Card Provisioning",
      description: "NFC card issuance and LNURL-withdraw endpoints - not actively probed",
      status: "operational",
    },
  ];

  const lastRefreshed = apiHealth.dataUpdatedAt
    ? new Date(apiHealth.dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <BlueprintShell>
      <main className="relative z-20 mx-auto max-w-[760px] px-5 sm:px-8 pb-20 pt-10">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-[#F7931A]/80">
              Infrastructure
            </span>
            <h1
              className="mt-3 font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em] text-white"
              style={{ fontSize: "clamp(34px, 6vw, 56px)" }}
            >
              SYSTEM STATUS
            </h1>
            <p className="mt-3 font-['Ubuntu'] text-[15px] leading-relaxed text-white/55">
              Live status of bitPOS infrastructure.
            </p>
          </div>
          <div className="sm:mt-10 sm:flex-shrink-0">
            <OverallBanner services={services} />
          </div>
        </div>

        {/* ── Service rows ── */}
        <div className="mt-10 divide-y divide-dashed divide-[#F7931A]/15 rounded-lg border border-dashed border-[#F7931A]/20">
          {services.map((service, i) => (
            <div key={i} className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <Dot status={service.status} />
                  <span className="font-['Ubuntu'] text-[15px] font-bold text-white">
                    {service.name}
                  </span>
                </div>
                <p className="mt-1 font-['Ubuntu'] text-[13px] leading-relaxed text-white/45 pl-[18px]">
                  {service.description}
                </p>
                {service.checkedAt && (
                  <p className="mt-2 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.12em] text-white/25 pl-[18px]">
                    Checked {service.checkedAt.toLocaleTimeString()}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 pt-0.5">
                <StatusLabel status={service.status} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Refresh note ── */}
        <p className="mt-6 font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.14em] text-white/30">
          {lastRefreshed
            ? `Auto-refreshes every 60 s - last at ${lastRefreshed}`
            : "Checks run automatically every 60 seconds"}
        </p>

      </main>
    </BlueprintShell>
  );
}
