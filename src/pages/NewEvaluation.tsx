import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const SELF_URL =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

const EXAMPLE_SPEC = `Users can create an account and log in.
Users can create a task and mark it complete.
Completed tasks should remain completed after a page refresh.
There is a dashboard with task metrics and navigation between pages.
The app uses a backend API to persist data.`;

export function NewEvaluation() {
  const nav = useNavigate();
  const [targetUrl, setTargetUrl] = useState("");
  const [spec, setSpec] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!targetUrl.trim() || !spec.trim()) {
      setError("Both a target URL and a product spec are required.");
      return;
    }
    setSubmitting(true);
    try {
      const run = await api.createRun(targetUrl.trim(), spec.trim());
      nav(`/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">New Evaluation</h1>
          <div className="page-subtitle">
            Give VibeTrace a deployed app and the prompt it was built from.
          </div>
        </div>
      </div>

      {error && <div className="banner error-banner">{error}</div>}

      <div className="card" style={{ maxWidth: 760 }}>
        <div className="field">
          <label>Deployed app URL</label>
          <input
            className="input"
            placeholder="https://your-app.example.app"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
          />
          <div className="hint">
            The live URL VibeTrace will open and test with a headless browser.
          </div>
        </div>

        <div className="field">
          <label>Original product spec / prompt</label>
          <textarea
            className="textarea"
            placeholder={EXAMPLE_SPEC}
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
          />
          <div className="hint">
            Natural language is fine — VibeTrace converts this into 3–8 user-level
            acceptance tests.
          </div>
        </div>

        <div className="row spread">
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setTargetUrl(SELF_URL);
                setSpec(
                  `VibeTrace is a reliability dashboard for AI-built apps.
Users can start a new evaluation from a URL and a spec.
The dashboard shows a reliability score, latency, and failure clusters.
Users can navigate between dashboard, history, and compare pages.
Evaluation runs are persisted and comparable across versions.`,
                );
              }}
            >
              Evaluate VibeTrace itself
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setTargetUrl("https://taskflow-demo.example.app");
                setSpec(EXAMPLE_SPEC);
              }}
            >
              Load example
            </button>
          </div>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" /> &nbsp;Evaluating…
              </>
            ) : (
              "Run evaluation"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
