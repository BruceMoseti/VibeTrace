# VibeTrace

**Autonomous reliability + performance evaluator for AI-built apps.**

Give VibeTrace a deployed app URL and the original natural-language product
prompt. It converts the spec into user-level acceptance tests, drives the app in
a headless browser, measures performance, captures failures, clusters them with
short root-cause hypotheses, and tracks regressions between versions.

> Built as a small, focused interpretation of the "does the AI-generated app
> actually behave the way the user asked?" problem — the same question behind
> Replit's ViBench and their Telescope evaluation loop.

## What it does

1. **Input** — a deployed URL + the original product spec/prompt.
2. **Spec → tests** — the spec is converted into 3–8 user-level acceptance tests
   (e.g. *"User can create an account and log in"*, *"Completed tasks remain
   completed after refresh"*), each tagged with a failure category.
3. **Evaluate** — a headless Chromium (Playwright) opens the app and collects
   real signals: page-load latency, JS console errors, failed network requests,
   and screenshots.
4. **Score** — a **Vibe Reliability Score** (0–100) built from functional
   correctness, performance, console/network health, and spec coverage.
5. **Cluster** — failures are grouped into categories (Authentication,
   Navigation, Data Persistence, API Failure, Performance, UI Interaction) each
   with a short LLM-style hypothesis about the likely cause.
6. **Persist & compare** — every run is stored in SQLite. The **Compare** view
   diffs two runs to surface fixes, regressions, and latency shifts across
   versions.
7. **Efficiency** — an estimated AI cost and a *reliability-per-dollar* metric,
   echoing the quality × latency × cost tradeoff modern agent systems optimize.

## Real vs. simulated (honest by design)

- **Real** when Playwright can reach the target: load latency, console errors,
  failed network requests, and screenshots are genuine browser signals.
  Per-test verdicts are heuristic DOM probes derived from those real signals
  (executing arbitrary natural-language flows is intentionally out of MVP scope).
- **Synthetic** fallback when the target is unreachable or browsers aren't
  installed: results are **deterministic and reproducible** for a given
  `(url, spec, seed)` so History/Compare tell a coherent story.

Every run is labelled `real` or `synthetic` in the UI. The spec→test,
clustering-hypothesis, and cost components are pluggable — each can be swapped
for a real LLM call without touching the evaluator or storage layers.

## Tech stack

- **Frontend:** React + Vite + TypeScript, dark systems-observability UI.
- **Backend:** Express + TypeScript.
- **Evaluation:** Playwright (Chromium) with a deterministic synthetic fallback.
- **Storage:** SQLite (`better-sqlite3`).

## Run locally

```bash
npm install
npx playwright install chromium   # optional: enables real evaluation mode
npm run build                     # build the frontend
npm start                         # serve API + UI on http://localhost:3000
```

On first boot the app seeds a realistic multi-version demo history ("TaskFlow")
so the dashboard and Compare views look complete immediately.

For development with hot reload:

```bash
npm run dev   # Vite on :5173 (proxies /api to Express on :3001)
```

### Run on Replit

The repo ships with `.replit` and `replit.nix`. Import it and press **Run** — it
builds the frontend and starts the server on port 3000.

## API

| Method | Endpoint                     | Description                          |
| ------ | ---------------------------- | ------------------------------------ |
| POST   | `/api/evaluations`           | Run an evaluation `{ targetUrl, spec }` |
| GET    | `/api/evaluations`           | List run summaries                   |
| GET    | `/api/evaluations/:id`       | Full run detail                      |
| GET    | `/api/evaluations/latest`    | Most recent run                      |
| GET    | `/api/compare?a=&b=`         | Diff two runs                        |

## Project layout

```
server/        Express API, evaluator, scoring, clustering, DB, seed
src/           React dashboard (Dashboard, New, History, Compare, RunDetail)
shared/types.ts  Types shared by client and server
```
