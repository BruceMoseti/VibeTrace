import type {
  CompareDelta,
  EvaluationRun,
  RunSummary,
} from "../shared/types.js";
import { clusterFailures } from "./clustering.js";
import { evaluate, type EvaluateOptions } from "./evaluator.js";
import { computeEfficiency, computeScores } from "./scoring.js";
import { specToTests } from "./specToTests.js";

const TOTAL_CATEGORIES = 6;

export async function runEvaluation(
  targetUrl: string,
  spec: string,
  opts: EvaluateOptions = {},
): Promise<Omit<EvaluationRun, "id">> {
  const tests = specToTests(spec);
  const artifacts = await evaluate(targetUrl, spec, tests, opts);
  const scores = computeScores(artifacts, TOTAL_CATEGORIES);
  const efficiency = computeEfficiency(artifacts, scores);
  const clusters = clusterFailures(artifacts.tests);

  return {
    targetUrl,
    spec,
    createdAt: new Date().toISOString(),
    mode: artifacts.mode,
    scores,
    medianLatencyMs: artifacts.medianLatencyMs,
    consoleErrors: artifacts.consoleErrors,
    networkFailures: artifacts.networkFailures,
    efficiency,
    tests: artifacts.tests,
    clusters,
  };
}

export function compareRuns(
  a: EvaluationRun,
  b: EvaluationRun,
): CompareDelta {
  const summaryOf = (r: EvaluationRun): RunSummary => ({
    id: r.id,
    targetUrl: r.targetUrl,
    createdAt: r.createdAt,
    mode: r.mode,
    reliability: r.scores.reliability,
    functionalCorrectness: r.scores.functionalCorrectness,
    performance: r.scores.performance,
    specCoverage: r.scores.specCoverage,
    medianLatencyMs: r.medianLatencyMs,
    passed: r.tests.filter((t) => t.status === "pass").length,
    failed: r.tests.filter((t) => t.status === "fail").length,
  });

  const statusById = (r: EvaluationRun) =>
    new Map(r.tests.map((t) => [t.id, t]));
  const aMap = statusById(a);
  const bMap = statusById(b);

  const fixedTests: string[] = [];
  const regressedTests: string[] = [];
  for (const [id, bTest] of bMap) {
    const aTest = aMap.get(id);
    if (!aTest) continue;
    if (aTest.status === "fail" && bTest.status === "pass") {
      fixedTests.push(bTest.description);
    } else if (aTest.status === "pass" && bTest.status === "fail") {
      regressedTests.push(bTest.description);
    }
  }

  const reliabilityDelta = b.scores.reliability - a.scores.reliability;
  const latencyDeltaPct =
    a.medianLatencyMs > 0
      ? Math.round(
          ((b.medianLatencyMs - a.medianLatencyMs) / a.medianLatencyMs) * 1000,
        ) / 10
      : 0;
  const newConsoleErrors = Math.max(
    0,
    b.consoleErrors.length - a.consoleErrors.length,
  );

  const notes: string[] = [];
  for (const f of fixedTests) notes.push(`Fixed: ${f}`);
  for (const r of regressedTests) notes.push(`Regression: ${r}`);
  if (latencyDeltaPct < 0)
    notes.push(
      `Median latency improved ${Math.abs(latencyDeltaPct)}% (${a.medianLatencyMs}ms → ${b.medianLatencyMs}ms).`,
    );
  else if (latencyDeltaPct > 0)
    notes.push(
      `Median latency regressed ${latencyDeltaPct}% (${a.medianLatencyMs}ms → ${b.medianLatencyMs}ms).`,
    );
  if (newConsoleErrors > 0)
    notes.push(`${newConsoleErrors} new console error(s) introduced.`);
  notes.push(
    `Reliability score: ${a.scores.reliability} → ${b.scores.reliability}.`,
  );

  return {
    a: summaryOf(a),
    b: summaryOf(b),
    reliabilityDelta,
    latencyDeltaPct,
    fixedTests,
    regressedTests,
    newConsoleErrors,
    notes,
  };
}
