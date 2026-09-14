import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CompareDelta, RunSummary } from "../../shared/types";
import { api } from "../api";
import { DeltaBadge, fmtDate, fmtLatency } from "../components/ui";

export function Compare() {
  const [params] = useSearchParams();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [aId, setAId] = useState<number | null>(null);
  const [bId, setBId] = useState<number | null>(null);
  const [delta, setDelta] = useState<CompareDelta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = (key: string) => {
      const n = Number(params.get(key));
      return Number.isInteger(n) && n > 0 ? n : null;
    };
    api.listRuns().then((r) => {
      setRuns(r);
      const a = fromQuery("a");
      const b = fromQuery("b");
      if (a && b) {
        setAId(a);
        setBId(b);
      } else if (r.length >= 2) {
        setAId(r[1].id);
        setBId(r[0].id);
      } else if (r.length === 1) {
        setAId(r[0].id);
        setBId(r[0].id);
      }
    });
  }, [params]);

  useEffect(() => {
    if (aId == null || bId == null) return;
    setError(null);
    api
      .compare(aId, bId)
      .then(setDelta)
      .catch((e) => setError(e.message));
  }, [aId, bId]);

  const options = useMemo(
    () =>
      runs.map((r) => (
        <option key={r.id} value={r.id}>
          #{r.id} · {r.reliability} · {fmtDate(r.createdAt)}
        </option>
      )),
    [runs],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Compare Runs</h1>
          <div className="page-subtitle">
            Diff two evaluations to spot fixes, regressions, and latency shifts.
          </div>
        </div>
      </div>

      {runs.length < 2 && (
        <div className="banner">
          You need at least two runs to compare. Run another evaluation first.
        </div>
      )}

      <div className="card">
        <div className="compare-col">
          <div>
            <label className="metric-label">Baseline (A)</label>
            <br />
            <select
              className="select"
              style={{ width: "100%", marginTop: 8 }}
              value={aId ?? ""}
              onChange={(e) => setAId(Number(e.target.value))}
            >
              {options}
            </select>
          </div>
          <div className="vs">→</div>
          <div>
            <label className="metric-label">Candidate (B)</label>
            <br />
            <select
              className="select"
              style={{ width: "100%", marginTop: 8 }}
              value={bId ?? ""}
              onChange={(e) => setBId(Number(e.target.value))}
            >
              {options}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="banner error-banner section-gap">{error}</div>}

      {delta && (
        <>
          <div className="grid grid-metrics section-gap">
            <div className="metric">
              <div className="metric-label">Reliability</div>
              <div className="metric-value">
                {delta.a.reliability} → {delta.b.reliability}
              </div>
              <DeltaBadge value={delta.reliabilityDelta} />
            </div>
            <div className="metric">
              <div className="metric-label">Time-to-interactive</div>
              <div className="metric-value">
                {fmtLatency(delta.a.medianLatencyMs)} → {fmtLatency(delta.b.medianLatencyMs)}
              </div>
              <DeltaBadge value={delta.latencyDeltaPct} suffix="%" invert />
            </div>
            <div className="metric">
              <div className="metric-label">Fixed behaviours</div>
              <div className="metric-value" style={{ color: "var(--accent)" }}>
                {delta.fixedTests.length}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Regressions</div>
              <div
                className="metric-value"
                style={{ color: delta.regressedTests.length ? "var(--danger)" : "var(--text)" }}
              >
                {delta.regressedTests.length}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">New console errors</div>
              <div className="metric-value">{delta.newConsoleErrors}</div>
            </div>
          </div>

          <div className="card section-gap">
            <h3 className="card-title">Change summary</h3>
            {delta.notes.map((n, i) => (
              <div className="note-line" key={i}>
                <span>{noteIcon(n)}</span>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function noteIcon(note: string): string {
  if (note.startsWith("Fixed")) return "✅";
  if (note.startsWith("Regression")) return "❌";
  if (note.startsWith("Still failing")) return "➖";
  if (note.includes("improved")) return "⚡";
  if (note.includes("regressed")) return "🐢";
  if (note.includes("console error")) return "⚠️";
  return "•";
}
