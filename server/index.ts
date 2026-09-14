import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunStep } from "../shared/types.js";
import {
  getLatestRun,
  getRun,
  insertRun,
  listRunSummaries,
} from "./db.js";
import {
  DEMO_VERSIONS,
  DEMO_VERSION_NOTES,
  TASKFLOW_SPEC,
  createDemoAppRouter,
} from "./demoApp.js";
import { seedIfEmpty } from "./seed.js";
import { compareRuns, runEvaluation } from "./service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`;

app.use(express.json({ limit: "8mb" }));

// The bundled app under test, plus its backend. Mounted first so the SPA
// catch-all below never shadows it.
app.use(createDemoAppRouter());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "vibetrace" });
});

app.get("/api/status", async (_req, res) => {
  let browser = "missing";
  const override = process.env.CHROMIUM_PATH;
  try {
    const { chromium } = await import("playwright");
    const path = override || chromium.executablePath();
    browser = existsSync(path) ? "ready" : "not-installed";
  } catch {
    browser = "playwright-missing";
  }
  res.json({
    browser,
    runs: listRunSummaries().length,
    mode: browser === "ready" ? "real" : "synthetic-fallback",
  });
});

app.get("/api/demo/versions", (_req, res) => {
  const runs = listRunSummaries();
  res.json({
    spec: TASKFLOW_SPEC,
    // The browser runs beside the server, so it reaches the app under test
    // directly. On a host that serves the dashboard through a public proxy —
    // Replit, Codespaces, a tunnel — going back in through that proxy would
    // add its latency to every measurement.
    origin: LOCAL_ORIGIN,
    versions: DEMO_VERSIONS.map((version) => {
      const path = `/demo-app/${version}`;
      const versionRuns = runs.filter((r) => r.targetUrl.endsWith(path));
      return {
        version,
        path,
        ...DEMO_VERSION_NOTES[version],
        latestRunId: versionRuns[0]?.id ?? null,
        latestReliability: versionRuns[0]?.reliability ?? null,
        runCount: versionRuns.length,
      };
    }),
  });
});

app.get("/api/evaluations", (_req, res) => {
  res.json(listRunSummaries());
});

app.get("/api/evaluations/latest", (_req, res) => {
  res.json(getLatestRun());
});

// Server-sent transcript of a run in progress. A live demo should show the work
// as it happens, not a spinner followed by a verdict.
app.get("/api/evaluations/stream", async (req, res) => {
  const targetUrl = String(req.query.targetUrl ?? "").trim();
  const spec = String(req.query.spec ?? "").trim();
  if (!targetUrl || !spec) {
    return res.status(400).json({ error: "targetUrl and spec are required" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(":keepalive\n\n"), 15000);

  try {
    const run = await runEvaluation(targetUrl, spec, {
      onStep: (step: RunStep) => send("step", step),
    });
    const id = insertRun(run);
    send("done", { id, mode: run.mode, reliability: run.scores.reliability });
  } catch (err) {
    console.error("[vibetrace] streamed evaluation failed:", err);
    send("failed", {
      error: err instanceof Error ? err.message : "evaluation failed",
    });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.get("/api/evaluations/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const run = getRun(id);
  if (!run) return res.status(404).json({ error: "run not found" });
  res.json(run);
});

app.post("/api/evaluations", async (req, res) => {
  const { targetUrl, spec } = req.body ?? {};
  if (typeof targetUrl !== "string" || !targetUrl.trim()) {
    return res.status(400).json({ error: "targetUrl is required" });
  }
  if (typeof spec !== "string" || !spec.trim()) {
    return res.status(400).json({ error: "spec is required" });
  }
  try {
    const run = await runEvaluation(targetUrl.trim(), spec.trim());
    const id = insertRun(run);
    res.status(201).json(getRun(id));
  } catch (err) {
    console.error("[vibetrace] evaluation failed:", err);
    res.status(500).json({ error: "evaluation failed" });
  }
});

app.get("/api/compare", (req, res) => {
  const aId = Number(req.query.a);
  const bId = Number(req.query.b);
  if (!Number.isInteger(aId) || !Number.isInteger(bId)) {
    return res.status(400).json({ error: "a and b query params are required" });
  }
  const a = getRun(aId);
  const b = getRun(bId);
  if (!a || !b) return res.status(404).json({ error: "run not found" });
  res.json(compareRuns(a, b));
});

// Serve the built frontend in production.
const distDir = resolve(__dirname, "../dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(resolve(distDir, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[vibetrace] listening on http://localhost:${PORT}`);
  console.log(`[vibetrace] app under test: ${LOCAL_ORIGIN}/demo-app/v1`);
  seedIfEmpty(LOCAL_ORIGIN).catch((err) =>
    console.error("[vibetrace] seed error:", err),
  );
});
