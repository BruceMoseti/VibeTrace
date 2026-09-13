import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { RunSummary } from "../../shared/types";
import { api } from "../api";
import { ModeBadge, fmtDate, fmtLatency, scoreColor } from "../components/ui";

export function History() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listRuns().then((r) => {
      setRuns(r);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" /> Loading history…
      </div>
    );
  }

  const maxRel = Math.max(100, ...runs.map((r) => r.reliability));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Run History</h1>
          <div className="page-subtitle">
            Reliability and performance across every evaluated version.
          </div>
        </div>
        <Link to="/compare" className="btn">
          Compare Runs
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="empty">No runs yet.</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 className="card-title">Reliability trend (oldest → newest)</h3>
            <div
              className="row"
              style={{ alignItems: "flex-end", gap: 10, height: 160, paddingTop: 10 }}
            >
              {[...runs].reverse().map((r) => (
                <Link
                  to={`/runs/${r.id}`}
                  key={r.id}
                  title={`Run #${r.id} · ${r.reliability}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 46,
                      height: `${(r.reliability / maxRel) * 130}px`,
                      background: scoreColor(r.reliability),
                      borderRadius: "6px 6px 0 0",
                      boxShadow: `0 0 12px ${scoreColor(r.reliability)}66`,
                    }}
                  />
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    #{r.id}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Target</th>
                  <th>When</th>
                  <th>Mode</th>
                  <th>Reliability</th>
                  <th>Passed</th>
                  <th>Median latency</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">#{r.id}</td>
                    <td className="mono" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.targetUrl}
                    </td>
                    <td className="muted">{fmtDate(r.createdAt)}</td>
                    <td>
                      <ModeBadge mode={r.mode} />
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{ color: scoreColor(r.reliability), fontWeight: 700 }}
                      >
                        {r.reliability}
                      </span>
                    </td>
                    <td className="mono">
                      {r.passed}/{r.passed + r.failed}
                    </td>
                    <td className="mono">{fmtLatency(r.medianLatencyMs)}</td>
                    <td>
                      <Link to={`/runs/${r.id}`} className="btn" style={{ padding: "5px 12px" }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
