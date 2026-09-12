import type {
  FailureCategory,
  FailureCluster,
  TestResult,
} from "../shared/types.js";

// Groups individual failures into higher-level clusters and attaches a short,
// LLM-style hypothesis about the likely root cause. This mirrors the reason
// Telescope-style systems cluster failures: aggregate metrics tell you that
// something moved; clusters + hypotheses help explain why.
//
// The hypothesis generator here is a deterministic heuristic keyed on category
// and observed detail text. It is intentionally pluggable: replacing this with a
// real LLM call (failures -> hypothesis) requires no other changes.

const HYPOTHESES: Record<FailureCategory, (details: string[]) => string> = {
  Authentication: (d) =>
    d.some((x) => /session/i.test(x))
      ? "Session/token is not persisted after login — likely a missing or misconfigured auth cookie / JWT handling."
      : "Login flow is failing before a session is established — check credential validation and the auth endpoint.",
  Navigation: () =>
    "Routes are not rendering their expected content — likely broken client-side routing or missing route guards.",
  "Data Persistence": () =>
    "State is lost across reloads — writes are probably not reaching the database, or reads are not rehydrating from it.",
  "API Failure": (d) =>
    d.some((x) => /5\d\d|500|504/.test(x))
      ? "Backend is returning 5xx errors — likely an unhandled server exception or a downstream timeout."
      : "API requests are failing — check endpoint paths, auth headers, and error handling on the client.",
  Performance: () =>
    "Workflows exceed the latency budget — investigate slow queries, blocking network calls, or unoptimized rendering.",
  "UI Interaction": () =>
    "Interactive controls are not usable — elements may be missing, disabled, or not wired to handlers.",
};

export function clusterFailures(tests: TestResult[]): FailureCluster[] {
  const failures = tests.filter((t) => t.status === "fail");
  const byCategory = new Map<FailureCategory, TestResult[]>();

  for (const f of failures) {
    const arr = byCategory.get(f.category) ?? [];
    arr.push(f);
    byCategory.set(f.category, arr);
  }

  const clusters: FailureCluster[] = [];
  for (const [category, items] of byCategory) {
    clusters.push({
      category,
      count: items.length,
      hypothesis: HYPOTHESES[category](items.map((i) => i.detail)),
      testIds: items.map((i) => i.id),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}
