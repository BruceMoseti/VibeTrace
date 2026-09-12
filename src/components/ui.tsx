import type { ReactNode } from "react";

export function scoreColor(v: number): string {
  if (v >= 85) return "var(--accent)";
  if (v >= 70) return "var(--warn)";
  return "var(--danger)";
}

export function ScoreGauge({ value }: { value: number }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  const color = scoreColor(value);
  return (
    <div className="gauge">
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle
          cx="74"
          cy="74"
          r={r}
          fill="none"
          stroke="var(--bg-elev-2)"
          strokeWidth="12"
        />
        <circle
          cx="74"
          cy="74"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="gauge-center">
        <div>
          <div className="gauge-score" style={{ color }}>
            {value}
          </div>
          <div className="gauge-max">/ 100</div>
        </div>
      </div>
    </div>
  );
}

export function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="subscore-row">
      <div className="subscore-label">{label}</div>
      <div className="bar">
        <div
          className="bar-fill"
          style={{ width: `${value}%`, background: scoreColor(value) }}
        />
      </div>
      <div className="subscore-val">{value}</div>
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { value: number; suffix?: string; invert?: boolean };
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
      {delta && <DeltaBadge {...delta} />}
    </div>
  );
}

export function DeltaBadge({
  value,
  suffix = "",
  invert = false,
}: {
  value: number;
  suffix?: string;
  invert?: boolean;
}) {
  const rounded = Math.round(value * 10) / 10;
  let good = rounded > 0;
  if (invert) good = rounded < 0;
  const cls = rounded === 0 ? "flat" : good ? "up" : "down";
  const arrow = rounded === 0 ? "→" : rounded > 0 ? "↑" : "↓";
  return (
    <span className={`delta ${cls}`} style={{ marginTop: 8 }}>
      {arrow} {rounded > 0 ? "+" : ""}
      {rounded}
      {suffix}
    </span>
  );
}

export function StatusPill({ status }: { status: "pass" | "fail" }) {
  return <span className={`pill ${status}`}>{status.toUpperCase()}</span>;
}

export function ModeBadge({ mode }: { mode: "real" | "synthetic" }) {
  return <span className={`badge ${mode}`}>{mode}</span>;
}

export function fmtLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
