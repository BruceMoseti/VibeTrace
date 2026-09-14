import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RunStep } from "../../shared/types";
import {
  api,
  streamRun,
  VERDICT_RE,
  type DemoInfo,
  type DemoVersionInfo,
  type EngineStatus,
} from "../api";
import { LiveConsole } from "../components/LiveConsole";
import { scoreColor } from "../components/ui";

const PRESENTER_KEY = "vibetrace.presenterNotes";

const TALK_TRACK: { when: string; say: string }[] = [
  {
    when: "Before the first run",
    say: "This is the prompt someone gave an agent, and this is the app it produced. Three builds of it. The question is whether any of them actually do what the prompt asked.",
  },
  {
    when: "While v1 is running",
    say: "That's a real browser. It just created an account, added a task, ticked it off, reloaded the page, and went looking for it again.",
  },
  {
    when: "On the v1 result",
    say: "Two of these failures are the same shape: the screen said it worked, the database disagreed. You only find that by reloading — which is exactly what a user does.",
  },
  {
    when: "Starting v2",
    say: "Same spec, next build. The agent got a bug report and fixed it.",
  },
  {
    when: "On Compare v1 → v2",
    say: "Three behaviours fixed, one new regression. That's the number I care about — not whether the app got better, but what it traded away.",
  },
  {
    when: "Starting v3",
    say: "This build was an optimisation pass. Watch what it costs.",
  },
  {
    when: "On Compare v2 → v3",
    say: "It fixed delete and broke the session, and got a second slower. This is the diff I'd gate a deploy on.",
  },
];

export function DemoLab() {
  const nav = useNavigate();
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; reliability: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(
    () => localStorage.getItem(PRESENTER_KEY) === "on",
  );
  const cancelRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(() => {
    api.demo().then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    refresh();
    api.status().then(setStatus).catch(() => setStatus(null));
    return () => cancelRef.current?.();
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(PRESENTER_KEY, showNotes ? "on" : "off");
  }, [showNotes]);

  const progress = useMemo(() => {
    const verdicts = steps.filter((s) => VERDICT_RE.test(s.message));
    return {
      checked: verdicts.length,
      failing: verdicts.filter((s) => s.level === "bad").length,
    };
  }, [steps]);

  function runVersion(version: DemoVersionInfo) {
    if (!info || running) return;
    cancelRef.current?.();
    setSteps([]);
    setResult(null);
    setError(null);
    setRunning(version.version);
    setActiveVersion(version.version);
    cancelRef.current = streamRun(
      `${window.location.origin}${version.path}`,
      info.spec,
      {
        onStep: (step) => setSteps((prev) => [...prev, step]),
        onDone: ({ id, reliability }) => {
          setRunning(null);
          setResult({ id, reliability });
          refresh();
        },
        onError: (message) => {
          setRunning(null);
          setError(message);
        },
      },
    );
  }

  const runIdFor = (v: string) =>
    info?.versions.find((x) => x.version === v)?.latestRunId ?? null;

  function compare(aVersion: string, bVersion: string) {
    const a = runIdFor(aVersion);
    const b = runIdFor(bVersion);
    if (a && b) nav(`/compare?a=${a}&b=${b}`);
  }

  if (!info) {
    return (
      <div className="empty">
        <span className="spinner" /> Loading the demo lab…
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Demo Lab</h1>
          <div className="page-subtitle">
            Three builds of the same app, one spec, evaluated in a real browser.
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showNotes}
            onChange={(e) => setShowNotes(e.target.checked)}
          />
          Presenter notes
        </label>
      </div>

      {status && status.mode !== "real" && (
        <div className="banner">
          No browser is available ({status.browser}), so runs will use the
          synthetic engine. Run <span className="mono">npm run setup:browser</span> to
          evaluate for real.
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 className="card-title">The prompt the app was built from</h3>
          <pre className="spec-block">{info.spec}</pre>
        </div>
        <div className="card">
          <h3 className="card-title">What happens when you press Evaluate</h3>
          <ol className="steps-list">
            <li>The prompt is turned into user-level behaviours to verify.</li>
            <li>
              A headless Chromium opens the build and actually uses it — signs
              up, adds a task, ticks it off, reloads, deletes, navigates.
            </li>
            <li>
              Every verdict comes from what the browser observed, alongside real
              console errors, failed requests, and time-to-interactive.
            </li>
            <li>Failures are clustered, and the run is diffed against earlier builds.</li>
          </ol>
        </div>
      </div>

      <div className="grid grid-3 section-gap">
        {info.versions.map((v) => (
          <div
            className={`card version-card${activeVersion === v.version ? " active" : ""}`}
            key={v.version}
          >
            <div className="row spread">
              <span className="version-tag">{v.version}</span>
              {v.latestReliability != null && (
                <span
                  className="version-score"
                  style={{ color: scoreColor(v.latestReliability) }}
                  title={`Latest reliability score for ${v.version}`}
                >
                  {v.latestReliability}
                </span>
              )}
            </div>
            <div className="version-label">{v.label.replace(/^v\d+ — /, "")}</div>
            <div className="version-summary">{v.summary}</div>

            <details className="answer-key">
              <summary>Answer key — what is actually broken</summary>
              <ul>
                {v.planted.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>

            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button
                className="btn btn-primary"
                disabled={!!running}
                onClick={() => runVersion(v)}
              >
                {running === v.version ? (
                  <>
                    <span className="spinner" />
                    &nbsp;Evaluating…
                  </>
                ) : (
                  "Evaluate"
                )}
              </button>
              <a className="btn" href={v.path} target="_blank" rel="noreferrer">
                Open app ↗
              </a>
              {v.latestRunId && (
                <Link className="btn" to={`/runs/${v.latestRunId}`}>
                  Last run
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card section-gap">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            {activeVersion
              ? `Live evaluation — TaskFlow ${activeVersion}`
              : "Live evaluation"}
          </h3>
          <div className="row" style={{ gap: 14 }}>
            {progress.checked > 0 && (
              <span className="muted mono" style={{ fontSize: 12.5 }}>
                {progress.checked} checked · {progress.failing} failing
              </span>
            )}
            {result && (
              <>
                <span
                  className="mono"
                  style={{ fontWeight: 700, color: scoreColor(result.reliability) }}
                >
                  {result.reliability}/100
                </span>
                <Link className="btn btn-primary" to={`/runs/${result.id}`}>
                  Open full run
                </Link>
              </>
            )}
          </div>
        </div>

        {error && <div className="banner error-banner">{error}</div>}

        <LiveConsole
          steps={steps}
          running={!!running}
          emptyLabel="Press Evaluate on a build above — the browser session streams here line by line."
        />
      </div>

      <div className="card section-gap">
        <h3 className="card-title">Diff two builds</h3>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {[
            ["v1", "v2"],
            ["v2", "v3"],
            ["v1", "v3"],
          ].map(([a, b]) => (
            <button
              key={`${a}${b}`}
              className="btn"
              disabled={!runIdFor(a) || !runIdFor(b)}
              onClick={() => compare(a, b)}
            >
              Compare {a} → {b}
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          Uses the most recent run of each build. Evaluate a build first if its
          button is disabled.
        </div>
      </div>

      {showNotes && (
        <div className="card section-gap notes-card">
          <h3 className="card-title">Presenter notes</h3>
          {TALK_TRACK.map((t) => (
            <div className="note-beat" key={t.when}>
              <div className="note-when">{t.when}</div>
              <div className="note-say">“{t.say}”</div>
            </div>
          ))}
          <div className="hint" style={{ marginTop: 12 }}>
            Then stop talking and let them ask. Toggle these off before sharing
            your screen.
          </div>
        </div>
      )}
    </div>
  );
}
