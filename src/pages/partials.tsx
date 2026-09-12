import type { TestResult } from "../../shared/types";
import { StatusPill, fmtLatency } from "../components/ui";

export function TestList({ tests }: { tests: TestResult[] }) {
  return (
    <div>
      {tests.map((t) => (
        <div className="test-row" key={t.id}>
          <StatusPill status={t.status} />
          <div>
            <div className="test-desc">{t.description}</div>
            <div className="test-detail">{t.detail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="tag">{t.category}</div>
            <div className="latency" style={{ marginTop: 4 }}>
              {fmtLatency(t.latencyMs)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
