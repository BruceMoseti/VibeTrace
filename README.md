# VibeTrace

**Does the app the agent built actually do what the person asked for?**

VibeTrace takes a deployed app plus the natural-language prompt it was built
from, turns that prompt into user-level behaviours, and then has a real browser
try to perform them. It signs up, creates something, marks it done, reloads the
page, and checks whether the thing it just did survived. What comes out is a
reliability score, a set of clustered failures with root-cause hypotheses, and a
diff against the previous build.

> Built as a focused take on the question behind Replit's ViBench and Telescope
> work: an agent can produce a plausible-looking application in one shot, and
> plausible-looking is not the same as correct.

---

## See it in 60 seconds

```bash
npm run demo
```

That installs anything missing (including a headless Chromium), builds the
dashboard, starts the server, and prints where to go. Open
**http://localhost:3000/demo**.

The repo ships with its own app under test, so there is nothing to deploy and
nothing to point it at. See [DEMO.md](DEMO.md) for a runbook.

---

## The app under test

`demo-app/` is **TaskFlow**, a small task manager standing in for something an
agent generated from a one-paragraph prompt. Three versions are served, each
with genuinely different runtime behaviour — no test hooks, no injected
verdicts, just ordinary application code with ordinary bugs in it:

| Build | What changed | What is wrong with it |
| --- | --- | --- |
| **v1** | The first pass | Completing a task never reaches the database; deleting only removes it from the screen; the metrics endpoint 500s; the task list is slow |
| **v2** | Fixed the bug report | A refactor left Delete throwing an uncaught `TypeError` |
| **v3** | An optimisation pass | Delete works again, but the session no longer survives a reload and a synchronous warm-up loop blocks first paint |

Evaluated against the same spec, they score **80 → 94 → 85**. The interesting
part is not the scores, it is that Compare explains the shape of each move:
three behaviours fixed and one regressed, then one fixed and two regressed.

---

## How a run works

1. **Spec → behaviours.** The prompt becomes up to nine user-level behaviours,
   each bound to a scripted browser journey.
2. **Drive the app.** Headless Chromium performs each journey for real — fills
   the login form, submits it, types into the composer, ticks the checkbox,
   reloads, clicks through the nav — while console errors, failed requests and
   time-to-interactive are recorded.
3. **Judge from evidence.** A behaviour passes or fails based on what the
   browser observed. Failures carry the specific reason: *"the task was ticked
   off and the UI updated, but after a reload it came back unchecked."*
4. **Score.** A 0–100 Vibe Reliability Score from functional correctness,
   performance, console/network health, and spec coverage.
5. **Cluster.** Failures are grouped by category and given a short hypothesis
   about the likely cause.
6. **Diff.** Every run is stored, so any two can be compared for fixes,
   regressions, behaviours still failing for a new reason, and latency shifts.

The whole session is streamed to the UI as it happens and saved as a transcript,
alongside the frames the browser captured at each step.

### Where the honesty line sits

- **Real:** the browser interactions, the pass/fail verdicts derived from them,
  console errors, failed requests, and load timings. Element lookup is generic —
  roles, input types, placeholders, accessible names — so a journey works
  against an app that has never heard of VibeTrace. When a journey cannot find
  what a step needs, it reports the missing affordance instead of guessing.
- **Deterministic, not real:** spec → behaviours is a keyword pass, the
  root-cause hypotheses are heuristics, and the cost model is an estimate. Each
  is a seam where a model call drops in without touching the evaluator.
- **Synthetic fallback:** with no browser available, runs are simulated,
  reproducible for a given `(url, spec, seed)`, and labelled `synthetic`
  everywhere they appear. Nothing silently pretends to be observed.

---

## Tech

React + Vite + TypeScript on the front, Express + TypeScript on the back,
Playwright for evaluation, SQLite (`better-sqlite3`) for storage, and
server-sent events for the live transcript.

## Commands

```bash
npm run demo            # install if needed, build, start — the one to remember
npm run demo:check      # preflight: node, deps, browser, port, database
npm run demo:reset      # wipe saved runs and re-seed on next boot
npm run setup:browser   # install Chromium only
npm run dev             # Vite on :5173, Express on :3001, hot reload
npm run typecheck
```

Environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `CHROMIUM_PATH` | — | Use a Chromium already on the machine instead of Playwright's |
| `VIBETRACE_SEED` | `real` | First-boot seeding: `real`, `synthetic`, or `off` |

### On Replit

`.replit` and `replit.nix` are committed. Import the repo and press **Run**: it
installs, uses the Nix-provided Chromium so there is no browser download,
builds, and serves on port 3000. [REPLIT.md](REPLIT.md) covers importing,
confirming real mode, deploying, and what to do when a container runs short of
memory.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/status` | Whether a browser is available, and how many runs are stored |
| `GET` | `/api/demo/versions` | The bundled builds, their spec, and their latest runs |
| `POST` | `/api/evaluations` | Run an evaluation `{ targetUrl, spec }` |
| `GET` | `/api/evaluations/stream?targetUrl=&spec=` | Same, streamed as server-sent events |
| `GET` | `/api/evaluations` | Run summaries |
| `GET` | `/api/evaluations/:id` | Full run, including transcript and frames |
| `GET` | `/api/compare?a=&b=` | Diff two runs |

## Layout

```
demo-app/           TaskFlow — the app under test (v1/v2/v3 behaviour)
server/
  flows.ts          the scripted user journeys and generic element lookup
  evaluator.ts      browser session, observations, synthetic fallback
  demoApp.ts        TaskFlow's backend, with its per-version faults
  specToTests.ts    prompt -> behaviours
  scoring.ts        reliability score and efficiency
  clustering.ts     failure grouping and hypotheses
  service.ts        run orchestration and run-to-run diffing
  db.ts  seed.ts  index.ts
src/                React dashboard (Demo Lab, Dashboard, History, Compare, Run detail)
shared/types.ts     types shared by client and server
scripts/            demo, preflight, reset
```
