import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { EvaluationRun } from "../../shared/types";
import { api } from "../api";
import {
  Metric,
  ModeBadge,
  ScoreGauge,
  SubScore,
  fmtDate,
  fmtLatency,
} from "../components/ui";
import { TestList } from "./partials";

export function RunDetail() {
  const { id } = useParams();
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getRun(Number(id))
      .then(setRun)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="empty">
        <span className="spinner" /> Loading run…
      </div>
    );
  if (notFound || !run) return <div className="empty">Run not found.</div>;

  const s = run.scores;
  const passed = run.tests.filter((t) => t.status === "pass").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Run #{run.id}</h1>
          <div className="page-subtitle">
            <span className="mono">{run.targetUrl}</span> · <ModeBadge mode={run.mode} /> ·{" "}
            {fmtDate(run.createdAt)}
          </div>
        </div>
        <Link to="/compare" className="btn">
          Compare
        </Link>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="card-title">Vibe Reliability Score</h3>
          <div className="gauge-wrap">
            <ScoreGauge value={s.reliability} />
            <div className="subscores">
              <SubScore label="Functional correctness" value={s.functionalCorrectness} />
              <SubScore label="Performance" value={s.performance} />
              <SubScore label="Console / network health" value={s.consoleNetworkHealth} />
              <SubScore label="Spec coverage" value={s.specCoverage} />
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Metrics</h3>
          <div className="grid grid-metrics">
            <Metric label="Median latency" value={fmtLatency(run.medianLatencyMs)} />
            <Metric label="Tests passed" value={`${passed}/${run.tests.length}`} />
            <Metric label="Est. AI cost" value={`$${run.efficiency.estimatedAiCostUsd.toFixed(3)}`} />
            <Metric label="Reliability / $" value={run.efficiency.reliabilityPerDollar.toFixed(1)} />
          </div>
        </div>
      </div>

      <div className="grid grid-2 section-gap">
        <div className="card">
          <h3 className="card-title">Acceptance tests</h3>
          <TestList tests={run.tests} />
        </div>
        <div className="card">
          <h3 className="card-title">Failure clusters</h3>
          {run.clusters.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No failures — every acceptance test passed.
            </div>
          ) : (
            run.clusters.map((c) => (
              <div className="cluster" key={c.category}>
                <div className="cluster-head">
                  <span className="cluster-cat">{c.category}</span>
                  <span className="cluster-count">
                    {c.count} failure{c.count > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="cluster-hyp">
                  <b>Hypothesis:</b> {c.hypothesis}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card section-gap">
        <h3 className="card-title">Original spec</h3>
        <pre
          className="mono"
          style={{ whiteSpace: "pre-wrap", color: "var(--text-dim)", fontSize: 12.5, margin: 0 }}
        >
          {run.spec}
        </pre>
      </div>
    </div>
  );
}
