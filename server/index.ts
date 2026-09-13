import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLatestRun,
  getRun,
  insertRun,
  listRunSummaries,
} from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { compareRuns, runEvaluation } from "./service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "vibetrace" });
});

app.get("/api/evaluations", (_req, res) => {
  res.json(listRunSummaries());
});

app.get("/api/evaluations/latest", (_req, res) => {
  res.json(getLatestRun());
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
    const saved = getRun(id);
    res.status(201).json(saved);
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

seedIfEmpty()
  .catch((err) => console.error("[vibetrace] seed error:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`[vibetrace] listening on http://localhost:${PORT}`);
    });
  });
