import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EvaluationRun } from "../../shared/types";
import { api } from "../api";
import {
  DeltaBadge,
  Metric,
  ModeBadge,
  ScoreGauge,
  StatusPill,
  SubScore,
  fmtLatency,
} from "../components/ui";
import { TestList } from "./partials";

export function Dashboard() {
  const [latest, setLatest] = useState<EvaluationRun | null>(null);
  const [previous, setPrevious] = useState<EvaluationRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const runs = await api.listRuns();
      if (runs.length > 0) {
        setLatest(await api.getRun(runs[0].id));
        if (runs.length > 1) setPrevious(await api.getRun(runs[1].id));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" /> Loading latest evaluation…
      </div>
    );
  }

  if (!latest) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <div className="page-subtitle">No evaluations yet.</div>
          </div>
        </div>
        <div className="empty">
          <p>Run your first evaluation to populate the reliability dashboard.</p>
          <Link to="/new" className="btn btn-primary">
            New Evaluation
          </Link>
        </div>
      </div>
    );
  }

  const s = latest.scores;
  const relDelta = previous
    ? latest.scores.reliability - previous.scores.reliability
    : 0;
  const latencyDeltaPct =
    previous && previous.medianLatencyMs > 0
      ? ((latest.medianLatencyMs - previous.medianLatencyMs) /
          previous.medianLatencyMs) *
        100
      : 0;
  const passed = latest.tests.filter((t) => t.status === "pass").length;
  const failedShots = latest.tests.filter(
    (t) => t.status === "fail" && t.screenshot,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Reliability Dashboard</h1>
          <div className="page-subtitle">
            <span className="mono">{latest.targetUrl}</span> &nbsp;·&nbsp;{" "}
            <ModeBadge mode={latest.mode} /> &nbsp; run #{latest.id}
          </div>
        </div>
        <Link to="/new" className="btn btn-primary">
          New Evaluation
        </Link>
      </div>

      {latest.mode === "synthetic" && (
        <div className="banner">
          This run used the <b>synthetic</b> engine — no browser could reach the
          target, so nothing here was observed. Results are deterministic for
          this (url, spec, seed) so history stays coherent, but install a
          browser with <span className="mono">npm run setup:browser</span> before
          trusting a number.
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 className="card-title">Vibe Reliability Score</h3>
          <div className="gauge-wrap">
            <div>
              <ScoreGauge value={s.reliability} />
              {previous && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <DeltaBadge value={relDelta} suffix=" vs prev" />
                </div>
              )}
            </div>
            <div className="subscores">
              <SubScore label="Functional correctness" value={s.functionalCorrectness} />
              <SubScore label="Performance" value={s.performance} />
              <SubScore label="Console / network health" value={s.consoleNetworkHealth} />
              <SubScore label="Spec coverage" value={s.specCoverage} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Efficiency</h3>
          <div className="grid grid-metrics">
            <Metric
              label="Est. AI cost"
              value={`$${latest.efficiency.estimatedAiCostUsd.toFixed(3)}`}
              sub="per evaluation run"
            />
            <Metric
              label="Reliability / $"
              value={latest.efficiency.reliabilityPerDollar.toFixed(1)}
              sub="quality per dollar"
            />
            <Metric
              label="Avg task latency"
              value={fmtLatency(latest.efficiency.avgTaskLatencyMs)}
              sub="across acceptance tests"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-metrics section-gap">
        <Metric
          label="Median time-to-interactive"
          value={fmtLatency(latest.medianLatencyMs)}
          delta={
            previous
              ? { value: latencyDeltaPct, suffix: "%", invert: true }
              : undefined
          }
        />
        <Metric
          label="Tests passed"
          value={`${passed}/${latest.tests.length}`}
          sub={`${latest.tests.length - passed} failing`}
        />
        <Metric label="Console errors" value={latest.consoleErrors.length} />
        <Metric label="Failed requests" value={latest.networkFailures.length} />
        <Metric label="Spec coverage" value={`${s.specCoverage}%`} />
      </div>

      <div className="grid grid-2 section-gap">
        <div className="card">
          <h3 className="card-title">Acceptance tests</h3>
          <TestList tests={latest.tests} />
        </div>
        <div className="card">
          <h3 className="card-title">Failure clusters</h3>
          {latest.clusters.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No failure clusters — all acceptance tests passed. 🎉
            </div>
          ) : (
            latest.clusters.map((c) => (
              <div className="cluster" key={c.category}>
                <div className="cluster-head">
                  <span className="cluster-cat">{c.category}</span>
                  <span className="cluster-count">{c.count} failure{c.count > 1 ? "s" : ""}</span>
                </div>
                <div className="cluster-hyp">
                  <b>Hypothesis:</b> {c.hypothesis}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {(latest.consoleErrors.length > 0 || latest.networkFailures.length > 0) && (
        <div className="grid grid-2 section-gap">
          <div className="card">
            <h3 className="card-title">Console errors</h3>
            {latest.consoleErrors.length === 0 ? (
              <div className="muted">None captured.</div>
            ) : (
              latest.consoleErrors.map((e, i) => (
                <div className="log-item" key={i}>
                  {e.message}
                  <span className="muted"> — {e.source}</span>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <h3 className="card-title">Failed network requests</h3>
            {latest.networkFailures.length === 0 ? (
              <div className="muted">None captured.</div>
            ) : (
              latest.networkFailures.map((n, i) => (
                <div className="log-item" key={i}>
                  <span className="status">{n.status}</span> {n.method} {n.url}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {failedShots.length > 0 && (
        <div className="card section-gap">
          <h3 className="card-title">Screenshots from failed workflows</h3>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {failedShots.map((t) => (
              <div key={t.id}>
                <img className="screenshot" src={t.screenshot!} alt={t.description} />
                <div className="test-detail" style={{ marginTop: 6 }}>
                  {t.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
