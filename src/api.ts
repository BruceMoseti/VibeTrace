import type {
  CompareDelta,
  EvaluationRun,
  RunSummary,
} from "../shared/types";

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
};
