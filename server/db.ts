import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EvaluationRun,
  RunSummary,
  TestResult,
} from "../shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../data/vibetrace.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_url TEXT NOT NULL,
    spec TEXT NOT NULL,
    created_at TEXT NOT NULL,
    mode TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    median_latency_ms INTEGER NOT NULL,
    console_errors_json TEXT NOT NULL,
    network_failures_json TEXT NOT NULL,
    efficiency_json TEXT NOT NULL,
    clusters_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS test_results (
    id TEXT NOT NULL,
    run_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    detail TEXT NOT NULL,
    screenshot TEXT,
    PRIMARY KEY (run_id, id),
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
  );
`);

type RunInput = Omit<EvaluationRun, "id">;

export function insertRun(run: RunInput): number {
  const insert = db.prepare(`
    INSERT INTO runs (
      target_url, spec, created_at, mode, scores_json, median_latency_ms,
      console_errors_json, network_failures_json, efficiency_json, clusters_json
    ) VALUES (
      @target_url, @spec, @created_at, @mode, @scores_json, @median_latency_ms,
      @console_errors_json, @network_failures_json, @efficiency_json, @clusters_json
    )
  `);

  const insertTest = db.prepare(`
    INSERT INTO test_results (id, run_id, description, category, status, latency_ms, detail, screenshot)
    VALUES (@id, @run_id, @description, @category, @status, @latency_ms, @detail, @screenshot)
  `);

  const tx = db.transaction((r: RunInput) => {
    const info = insert.run({
      target_url: r.targetUrl,
      spec: r.spec,
      created_at: r.createdAt,
      mode: r.mode,
      scores_json: JSON.stringify(r.scores),
      median_latency_ms: r.medianLatencyMs,
      console_errors_json: JSON.stringify(r.consoleErrors),
      network_failures_json: JSON.stringify(r.networkFailures),
      efficiency_json: JSON.stringify(r.efficiency),
      clusters_json: JSON.stringify(r.clusters),
    });
    const runId = Number(info.lastInsertRowid);
    for (const t of r.tests) {
      insertTest.run({
        id: t.id,
        run_id: runId,
        description: t.description,
        category: t.category,
        status: t.status,
        latency_ms: t.latencyMs,
        detail: t.detail,
        screenshot: t.screenshot ?? null,
      });
    }
    return runId;
  });

  return tx(run);
}

interface RunRow {
  id: number;
  target_url: string;
  spec: string;
  created_at: string;
  mode: "real" | "synthetic";
  scores_json: string;
  median_latency_ms: number;
  console_errors_json: string;
  network_failures_json: string;
  efficiency_json: string;
  clusters_json: string;
}

interface TestRow {
  id: string;
  description: string;
  category: string;
  status: string;
  latency_ms: number;
  detail: string;
  screenshot: string | null;
}

function hydrate(row: RunRow): EvaluationRun {
  const tests = db
    .prepare(`SELECT * FROM test_results WHERE run_id = ? ORDER BY rowid ASC`)
    .all(row.id) as TestRow[];

  return {
    id: row.id,
    targetUrl: row.target_url,
    spec: row.spec,
    createdAt: row.created_at,
    mode: row.mode,
    scores: JSON.parse(row.scores_json),
    medianLatencyMs: row.median_latency_ms,
    consoleErrors: JSON.parse(row.console_errors_json),
    networkFailures: JSON.parse(row.network_failures_json),
    efficiency: JSON.parse(row.efficiency_json),
    clusters: JSON.parse(row.clusters_json),
    tests: tests.map(
      (t): TestResult => ({
        id: t.id,
        description: t.description,
        category: t.category as TestResult["category"],
        status: t.status as TestResult["status"],
        latencyMs: t.latency_ms,
        detail: t.detail,
        screenshot: t.screenshot,
      }),
    ),
  };
}

export function getRun(id: number): EvaluationRun | null {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as
    | RunRow
    | undefined;
  return row ? hydrate(row) : null;
}

export function getLatestRun(): EvaluationRun | null {
  const row = db
    .prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT 1`)
    .get() as RunRow | undefined;
  return row ? hydrate(row) : null;
}

export function listRunSummaries(): RunSummary[] {
  const rows = db
    .prepare(`SELECT * FROM runs ORDER BY id DESC`)
    .all() as RunRow[];

  return rows.map((row): RunSummary => {
    const scores = JSON.parse(row.scores_json);
    const counts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) AS passed,
           SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS failed
         FROM test_results WHERE run_id = ?`,
      )
      .get(row.id) as { passed: number | null; failed: number | null };

    return {
      id: row.id,
      targetUrl: row.target_url,
      createdAt: row.created_at,
      mode: row.mode,
      reliability: scores.reliability,
      functionalCorrectness: scores.functionalCorrectness,
      performance: scores.performance,
      specCoverage: scores.specCoverage,
      medianLatencyMs: row.median_latency_ms,
      passed: counts.passed ?? 0,
      failed: counts.failed ?? 0,
    };
  });
}

export function countRuns(): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM runs`).get() as {
    n: number;
  };
  return row.n;
}
