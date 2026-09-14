import type {
  FailureCategory,
  FailureCluster,
  TestResult,
} from "../shared/types.js";

// Groups individual failures into higher-level clusters and attaches a short
// hypothesis about the likely root cause. Aggregate metrics tell you something
// moved; clusters and hypotheses are what let you act on it.
//
// The generator is a deterministic heuristic keyed on the category and on the
// evidence the flow actually collected. It is intentionally pluggable: swapping
// it for a model call (failures -> hypothesis) touches nothing else.

const BLOCKED = /^Blocked —/;

const HYPOTHESES: Record<FailureCategory, (details: string[]) => string> = {
  Authentication: (d) =>
    d.some((x) => /refresh|reload|signed the user out/i.test(x))
      ? "The session is not durable across reloads — the token is most likely held in memory instead of a cookie or localStorage, so every refresh starts a new anonymous session."
      : "Login never establishes a session — check credential validation, the auth endpoint's response, and whether the client stores what it gets back.",
  Navigation: (d) =>
    d.some((x) => /blank/i.test(x))
      ? "A route renders an empty document — the view is probably throwing during render, or the route is matched but has no component behind it."
      : "Routes are not rendering their own content — likely broken client-side routing or a missing route guard.",
  "Data Persistence": (d) =>
    d.some((x) => /came back unchecked|never reached storage/i.test(x))
      ? "The write is acknowledged optimistically but never lands: the UI updates locally while the server drops or ignores the update, so the two only disagree after a reload."
      : "State is lost across reloads — writes are probably not reaching the database, or reads are not rehydrating from it.",
  "API Failure": (d) =>
    d.some((x) => /→ 5\d\d/.test(x))
      ? "The backend is returning 5xx — likely an unhandled server exception or a downstream timeout on that endpoint."
      : "Requests are failing — check endpoint paths, auth headers, and client-side error handling.",
  Performance: () =>
    "Time-to-interactive is over budget — look for synchronous work on the main thread during boot, blocking network calls, or an unoptimised first render.",
  "UI Interaction": (d) =>
    d.some((x) => /TypeError|ReferenceError|undefined/i.test(x))
      ? "An uncaught exception fires inside the click handler, so the action aborts before it reaches the server — the button looks live but does nothing."
      : d.some((x) => /came back after a reload|never persisted/i.test(x))
        ? "The control updates the screen optimistically and the write is then lost — either the client never sends it or the server accepts it and discards it. The UI and the database only disagree once the page reloads."
        : "Interactive controls are not usable — elements may be missing, disabled, or never wired to a handler.",
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
    const details = items.map((i) => i.detail);
    const allBlocked = details.every((d) => BLOCKED.test(d));
    clusters.push({
      category,
      count: items.length,
      hypothesis: allBlocked
        ? "Nothing here was actually exercised — an earlier failure blocked the journey. Fix the upstream failure and re-run before reading anything into this cluster."
        : HYPOTHESES[category](details),
      testIds: items.map((i) => i.id),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}
