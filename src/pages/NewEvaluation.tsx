import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RunStep } from "../../shared/types";
import { api, streamRun } from "../api";
import { LiveConsole } from "../components/LiveConsole";

const EXAMPLE_SPEC = `Users can create an account and log in.
Users can create a task, mark it complete, and delete it.
Completed tasks should remain completed after a page refresh.
There is a dashboard with task metrics and navigation between pages.
The app uses a backend API to persist data.`;

export function NewEvaluation() {
  const nav = useNavigate();
  const [targetUrl, setTargetUrl] = useState("");
  const [spec, setSpec] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    api
      .demo()
      .then((d) => setSpec((cur) => cur || d.spec))
      .catch(() => {});
    return () => cancelRef.current?.();
  }, []);

  function submit() {
    setError(null);
    if (!targetUrl.trim() || !spec.trim()) {
      setError("Both a target URL and a product spec are required.");
      return;
    }
    setSteps([]);
    setRunning(true);
    cancelRef.current = streamRun(targetUrl.trim(), spec.trim(), {
      onStep: (step) => setSteps((prev) => [...prev, step]),
      onDone: ({ id }) => {
        setRunning(false);
        nav(`/runs/${id}`);
      },
      onError: (message) => {
        setRunning(false);
        setError(message);
      },
    });
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

      <div className="card" style={{ maxWidth: 820 }}>
        <div className="field">
          <label>Deployed app URL</label>
          <input
            className="input"
            placeholder="https://your-app.example.app"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={running}
          />
          <div className="hint">
            The live URL VibeTrace will open and drive with a headless browser.
          </div>
        </div>

        <div className="field">
          <label>Original product spec / prompt</label>
          <textarea
            className="textarea"
            placeholder={EXAMPLE_SPEC}
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            disabled={running}
          />
          <div className="hint">
            Natural language is fine — VibeTrace turns this into the user-level
            behaviours it will try to perform.
          </div>
        </div>

        <div className="row spread">
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn"
              type="button"
              disabled={running}
              onClick={() => setTargetUrl(`${window.location.origin}/demo-app/v1`)}
            >
              Use bundled TaskFlow v1
            </button>
            <button
              className="btn"
              type="button"
              disabled={running}
              onClick={() => setTargetUrl(window.location.origin)}
            >
              Evaluate VibeTrace itself
            </button>
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={running}>
            {running ? (
              <>
                <span className="spinner" /> &nbsp;Evaluating…
              </>
            ) : (
              "Run evaluation"
            )}
          </button>
        </div>
      </div>

      {(running || steps.length > 0) && (
        <div className="card section-gap" style={{ maxWidth: 820 }}>
          <h3 className="card-title">Browser session</h3>
          <LiveConsole steps={steps} running={running} height={300} />
        </div>
      )}
    </div>
  );
}
