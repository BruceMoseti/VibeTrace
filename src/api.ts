import type {
  CompareDelta,
  EvaluationRun,
  RunStep,
  RunSummary,
} from "../shared/types";

export interface DemoVersionInfo {
  version: string;
  path: string;
  label: string;
  summary: string;
  planted: string[];
  latestRunId: number | null;
  latestReliability: number | null;
  runCount: number;
}

export interface DemoInfo {
  spec: string;
  /** Where the evaluator should reach the app under test from. */
  origin: string;
  versions: DemoVersionInfo[];
}

export interface EngineStatus {
  browser: "ready" | "not-installed" | "playwright-missing" | string;
  runs: number;
  mode: "real" | "synthetic-fallback";
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listRuns: () => fetch("/api/evaluations").then(json<RunSummary[]>),
  latest: () => fetch("/api/evaluations/latest").then(json<EvaluationRun | null>),
  getRun: (id: number) =>
    fetch(`/api/evaluations/${id}`).then(json<EvaluationRun>),
  createRun: (targetUrl: string, spec: string) =>
    fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl, spec }),
    }).then(json<EvaluationRun>),
  compare: (a: number, b: number) =>
    fetch(`/api/compare?a=${a}&b=${b}`).then(json<CompareDelta>),
  demo: () => fetch("/api/demo/versions").then(json<DemoInfo>),
  status: () => fetch("/api/status").then(json<EngineStatus>),
};

export interface StreamHandlers {
  onStep: (step: RunStep) => void;
  onDone: (result: { id: number; mode: string; reliability: number }) => void;
  onError: (message: string) => void;
}

/**
 * Subscribes to a run's transcript as it happens. Returns a cancel function
 * that detaches the client; the server-side run finishes either way.
 */
export function streamRun(
  targetUrl: string,
  spec: string,
  handlers: StreamHandlers,
): () => void {
  const qs = new URLSearchParams({ targetUrl, spec });
  const source = new EventSource(`/api/evaluations/stream?${qs}`);
  let settled = false;

  source.addEventListener("step", (e) => {
    handlers.onStep(JSON.parse((e as MessageEvent).data) as RunStep);
  });
  source.addEventListener("done", (e) => {
    settled = true;
    source.close();
    handlers.onDone(JSON.parse((e as MessageEvent).data));
  });
  source.addEventListener("failed", (e) => {
    settled = true;
    source.close();
    handlers.onError(JSON.parse((e as MessageEvent).data).error ?? "Evaluation failed");
  });
  source.onerror = () => {
    if (settled) return;
    settled = true;
    source.close();
    handlers.onError("Lost the connection to the evaluator.");
  };

  return () => {
    settled = true;
    source.close();
  };
}

export const VERDICT_RE = /^\s*(PASS|FAIL) · /;
