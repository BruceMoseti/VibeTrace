export type TestStatus = "pass" | "fail";

export type FailureCategory =
  | "Authentication"
  | "Navigation"
  | "Data Persistence"
  | "API Failure"
  | "Performance"
  | "UI Interaction";

export interface AcceptanceTest {
  id: string;
  description: string;
  category: FailureCategory;
  /** The scripted user journey the evaluator runs to check this behaviour. */
  flowId: string;
}

export type StepLevel = "info" | "action" | "good" | "bad" | "warn" | "test";

export interface RunStep {
  /** Milliseconds since the run started. */
  t: number;
  level: StepLevel;
  message: string;
}

export interface TestResult {
  id: string;
  description: string;
  category: FailureCategory;
  status: TestStatus;
  latencyMs: number;
  detail: string;
  screenshot?: string | null;
}

export interface ConsoleError {
  message: string;
  source: string;
}

export interface NetworkFailure {
  url: string;
  status: number | string;
  method: string;
}

export interface Scores {
  reliability: number;
  functionalCorrectness: number;
  performance: number;
  consoleNetworkHealth: number;
  specCoverage: number;
}

export interface Efficiency {
  estimatedAiCostUsd: number;
  reliabilityPerDollar: number;
  avgTaskLatencyMs: number;
}

export interface FailureCluster {
  category: FailureCategory;
  count: number;
  hypothesis: string;
  testIds: string[];
}

export interface EvaluationRun {
  id: number;
  targetUrl: string;
  spec: string;
  createdAt: string;
  mode: "real" | "synthetic";
  scores: Scores;
  medianLatencyMs: number;
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
  efficiency: Efficiency;
  tests: TestResult[];
  clusters: FailureCluster[];
  /** Transcript of what the evaluator did, replayable in the run detail view. */
  steps: RunStep[];
}

export interface RunSummary {
  id: number;
  targetUrl: string;
  createdAt: string;
  mode: "real" | "synthetic";
  reliability: number;
  functionalCorrectness: number;
  performance: number;
  specCoverage: number;
  medianLatencyMs: number;
  passed: number;
  failed: number;
}

export interface CompareDelta {
  a: RunSummary;
  b: RunSummary;
  reliabilityDelta: number;
  latencyDeltaPct: number;
  fixedTests: string[];
  regressedTests: string[];
  /** Failing in both runs — with a note when the underlying reason changed. */
  stillFailing: { description: string; reasonChanged: boolean }[];
  newConsoleErrors: number;
  notes: string[];
}
