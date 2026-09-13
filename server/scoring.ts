import type { Efficiency, Scores } from "../shared/types.js";
import type { EvalArtifacts } from "./evaluator.js";

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// Maps median workflow latency to a 0-100 performance score.
// <=800ms is excellent (100); >=5000ms is poor (~25).
function latencyToScore(medianMs: number): number {
  if (medianMs <= 800) return 100;
  if (medianMs >= 5000) return 25;
  return clamp(100 - ((medianMs - 800) / (5000 - 800)) * 75);
}

export function computeScores(
  artifacts: EvalArtifacts,
  totalDistinctCategories: number,
): Scores {
  const total = artifacts.tests.length || 1;
  const passed = artifacts.tests.filter((t) => t.status === "pass").length;
  const functionalCorrectness = clamp((passed / total) * 100);

  const performance = latencyToScore(artifacts.medianLatencyMs);

  const healthPenalty =
    artifacts.consoleErrors.length * 6 + artifacts.networkFailures.length * 9;
  const consoleNetworkHealth = clamp(100 - healthPenalty);

  // Coverage rewards testing a broad set of capability categories.
  const coveredCategories = new Set(artifacts.tests.map((t) => t.category)).size;
  const specCoverage = clamp(
    (coveredCategories / Math.max(1, totalDistinctCategories)) * 100,
  );

  const reliability = clamp(
    0.45 * functionalCorrectness +
      0.2 * performance +
      0.2 * consoleNetworkHealth +
      0.15 * specCoverage,
  );

  return {
    reliability,
    functionalCorrectness,
    performance,
    consoleNetworkHealth,
    specCoverage,
  };
}

export function computeEfficiency(
  artifacts: EvalArtifacts,
  scores: Scores,
): Efficiency {
  const nTests = artifacts.tests.length || 1;
  const nFailures = artifacts.tests.filter((t) => t.status === "fail").length;

  // Synthetic cost model: spec->test generation + per-test evaluation +
  // per-failure LLM cluster analysis. Mirrors the quality x latency x cost
  // tradeoff modern agent systems optimize for.
  const specGen = 0.006;
  const perTest = 0.0025;
  const perFailureAnalysis = 0.004;
  const estimatedAiCostUsd =
    Math.round(
      (specGen + perTest * nTests + perFailureAnalysis * nFailures) * 1000,
    ) / 1000;

  const avgTaskLatencyMs = Math.round(
    artifacts.tests.reduce((a, t) => a + t.latencyMs, 0) / nTests,
  );

  const reliabilityPerDollar =
    estimatedAiCostUsd > 0
      ? Math.round((scores.reliability / (estimatedAiCostUsd * 100)) * 10) / 10
      : 0;

  return { estimatedAiCostUsd, reliabilityPerDollar, avgTaskLatencyMs };
}
