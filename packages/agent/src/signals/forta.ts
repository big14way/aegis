import { AttackClass, Source, type RawSignal } from "./types.js";

/**
 * Forta threat-feed adapter.
 *
 * Forta exposes real-time security alerts (exploits, oracle malfunctions, asset
 * depegs, anomalous transactions). When `FORTA_API_KEY` is configured this maps
 * live alerts into Aegis signals; otherwise it returns a small, deterministic
 * synthetic feed so the demo and tests run with zero external dependencies.
 *
 * The mapping from a Forta alert id / finding to an Aegis `AttackClass` is the
 * integration's domain logic — extend `classifyFinding` as new detectors ship.
 */

export interface FortaOptions {
  apiKey?: string;
  /** Monitored asset / protocol addresses to filter alerts for. */
  targets?: string[];
}

interface FortaAlert {
  alertId: string;
  name: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  findingType?: string;
  addresses?: string[];
  createdAt?: string;
}

const SEVERITY_BPS: Record<FortaAlert["severity"], number> = {
  LOW: 3_000,
  MEDIUM: 5_500,
  HIGH: 8_000,
  CRITICAL: 9_500,
};

/** Heuristic mapping from a Forta alert to an Aegis attack class. */
export function classifyFinding(alert: FortaAlert): AttackClass {
  const hay = `${alert.alertId} ${alert.name} ${alert.findingType ?? ""}`.toLowerCase();
  if (hay.includes("oracle") || hay.includes("price") || hay.includes("flash")) {
    return AttackClass.FlashLoanOracle;
  }
  if (hay.includes("bridge") || hay.includes("verifier") || hay.includes("proof")) {
    return AttackClass.BridgeVerifier;
  }
  if (hay.includes("ownership") || hay.includes("admin") || hay.includes("access")) {
    return AttackClass.AccessControl;
  }
  if (hay.includes("governance") || hay.includes("proposal") || hay.includes("timelock")) {
    return AttackClass.Governance;
  }
  if (hay.includes("dependency") || hay.includes("supply") || hay.includes("npm")) {
    return AttackClass.SupplyChain;
  }
  if (hay.includes("dprk") || hay.includes("lazarus") || hay.includes("sanction")) {
    return AttackClass.Dprk;
  }
  if (hay.includes("spoof") || hay.includes("impersonat") || hay.includes("fake")) {
    return AttackClass.SpoofToken;
  }
  return AttackClass.Unknown;
}

/** Query the live Forta GraphQL alerts API and map results into Aegis signals. */
async function fetchLiveAlerts(opts: FortaOptions): Promise<RawSignal[]> {
  // Forta's public alerts API (GraphQL). Endpoint kept configurable via env in
  // production; this is the documented public endpoint shape.
  const endpoint = "https://api.forta.network/graphql";
  const query = {
    query: `query Alerts($input: AlertsInput) { alerts(input: $input) { alerts { alertId name severity findingType addresses createdAt } } }`,
    variables: {
      input: {
        severities: ["HIGH", "CRITICAL"],
        addresses: opts.targets ?? [],
        first: 25,
      },
    },
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`Forta API ${res.status}`);
  const json = (await res.json()) as {
    data?: { alerts?: { alerts?: FortaAlert[] } };
  };
  const alerts = json.data?.alerts?.alerts ?? [];
  const now = Math.floor(Date.now() / 1000);
  return alerts.map((a) => ({
    source: Source.Forta,
    attackClass: classifyFinding(a),
    severityBps: SEVERITY_BPS[a.severity],
    confidenceBps: 8_500,
    observedAt: a.createdAt ? Math.floor(Date.parse(a.createdAt) / 1000) : now,
    note: `forta:${a.alertId}:${a.name}`,
  }));
}

/** Deterministic synthetic feed used when no API key is present. */
function stubAlerts(): RawSignal[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      source: Source.Forta,
      attackClass: AttackClass.FlashLoanOracle,
      severityBps: 8_200,
      confidenceBps: 8_500,
      observedAt: now - 30,
      note: "stub:forta:oracle-manipulation-suspected",
    },
  ];
}

export async function getFortaSignals(opts: FortaOptions = {}): Promise<RawSignal[]> {
  if (!opts.apiKey) {
    return stubAlerts();
  }
  try {
    return await fetchLiveAlerts(opts);
  } catch (err) {
    console.warn(`[forta] live fetch failed, falling back to stub: ${(err as Error).message}`);
    return stubAlerts();
  }
}
