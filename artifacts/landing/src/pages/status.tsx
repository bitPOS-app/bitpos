import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";

type ServiceStatus = "operational" | "degraded" | "down" | "loading";

interface Service {
  name: string;
  description: string;
  status: ServiceStatus;
  checkedAt?: Date;
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking...
      </span>
    );
  }
  if (status === "operational") {
    return <span className="text-sm text-green-500 font-medium">Operational</span>;
  }
  if (status === "degraded") {
    return <span className="text-sm text-yellow-500 font-medium">Degraded</span>;
  }
  return <span className="text-sm text-red-500 font-medium">Down</span>;
}

function OverallBadge({ services }: { services: Service[] }) {
  const anyLoading = services.some((s) => s.status === "loading");
  const anyDown = services.some((s) => s.status === "down");
  const anyDegraded = services.some((s) => s.status === "degraded");

  if (anyLoading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-secondary px-4 py-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-medium">Checking systems...</span>
      </div>
    );
  }
  if (anyDown) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-red-500">
        <XCircle className="h-5 w-5" />
        <span className="font-medium">Service Disruption</span>
      </div>
    );
  }
  if (anyDegraded) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-yellow-500">
        <AlertTriangle className="h-5 w-5" />
        <span className="font-medium">Partial Outage</span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2 text-green-500">
      <CheckCircle2 className="h-5 w-5" />
      <span className="font-medium">All Systems Operational</span>
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
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
      <div className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">System Status</h1>
          <p className="text-muted-foreground">Live status of bitPOS infrastructure.</p>
        </div>
        <OverallBadge services={services} />
      </div>

      <div className="space-y-4">
        {services.map((service, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">{service.name}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{service.description}</p>
              </div>
              <StatusBadge status={service.status} />
            </div>
            {service.checkedAt && (
              <p className="text-xs text-muted-foreground mt-4 font-mono">
                Last checked: {service.checkedAt.toLocaleTimeString()}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3" />
        <span>
          {lastRefreshed
            ? `Auto-refreshes every 60 seconds - last at ${lastRefreshed}`
            : "Checks run automatically every 60 seconds"}
        </span>
      </div>
    </div>
  );
}
