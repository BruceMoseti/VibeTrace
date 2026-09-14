import express, { type Router } from "express";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Backend for the bundled "app under test" (see demo-app/). Three versions of
// TaskFlow are served from the same code path, each with a different set of
// genuine faults, so VibeTrace has a moving target to evaluate and diff.
//
// State is in-memory and scoped to a session token, so every evaluation run
// starts from an empty task list without any explicit reset.

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEMO_VERSIONS = ["v1", "v2", "v3"] as const;
export type DemoVersion = (typeof DEMO_VERSIONS)[number];

interface ServerFaults {
  /** Extra latency applied to the task list endpoint, in ms. */
  taskListDelayMs: number;
  /** Accept the "mark complete" write with a 200 but never store it. */
  dropCompletionWrites: boolean;
  /** Acknowledge a delete without actually removing the row. */
  dropDeletes: boolean;
  /** Fail the dashboard metrics endpoint with a 500. */
  metricsServerError: boolean;
}

const SERVER_FAULTS: Record<DemoVersion, ServerFaults> = {
  v1: {
    taskListDelayMs: 700,
    dropCompletionWrites: true,
    dropDeletes: true,
    metricsServerError: true,
  },
  v2: {
    taskListDelayMs: 0,
    dropCompletionWrites: false,
    dropDeletes: false,
    metricsServerError: false,
  },
  v3: {
    taskListDelayMs: 0,
    dropCompletionWrites: false,
    dropDeletes: false,
    metricsServerError: false,
  },
};

/**
 * The prompt TaskFlow was "built from" — the input a person would have given an
 * agent. VibeTrace evaluates every version against this same text.
 */
export const TASKFLOW_SPEC = `TaskFlow is a personal task manager.

Users can create an account and log in with an email and password, and they
stay logged in while they use the app.

A signed-in user can add a task, mark a task complete, and delete a task.
Completed tasks must still be complete after the page is refreshed.

There is a dashboard page showing task metrics, and users can navigate between
the task list and the dashboard.

Everything is stored through a backend API.`;

/** Human-readable changelog, surfaced in the VibeTrace demo UI. */
export const DEMO_VERSION_NOTES: Record<
  DemoVersion,
  { label: string; summary: string; planted: string[] }
> = {
  v1: {
    label: "v1 — first agent build",
    summary: "The app the agent produced from the prompt on the first pass.",
    planted: [
      "Marking a task complete never reaches the database",
      "Deleting a task only removes it from the screen",
      "Dashboard metrics endpoint returns 500",
      "Task list endpoint is slow (700ms)",
    ],
  },
  v2: {
    label: "v2 — agent fixes the bug report",
    summary: "The writes and the metrics endpoint were repaired.",
    planted: ["A refactor left Delete throwing an uncaught TypeError"],
  },
  v3: {
    label: "v3 — agent 'optimizes'",
    summary: "Delete works again, but the rewrite cost a session and a second.",
    planted: [
      "Login no longer survives a page reload",
      "A synchronous warm-up loop blocks first paint",
    ],
  },
};

interface Task {
  id: string;
  title: string;
  done: boolean;
}

interface Account {
  email: string;
  tasks: Task[];
}

// Tasks belong to the account, not the session token, so signing back in after
// a dropped session restores the same list — the way a real app would behave.
const accounts = new Map<string, Account>();
const sessions = new Map<string, Account>();

function isVersion(v: string): v is DemoVersion {
  return (DEMO_VERSIONS as readonly string[]).includes(v);
}

interface RequestContext {
  faults: ServerFaults;
  session: Account;
}

/** Per-request state stashed by the version and auth middleware below. */
function ctx(req: express.Request): RequestContext {
  return req as unknown as RequestContext;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createDemoAppRouter(): Router {
  const router = express.Router();
  const staticDir = resolve(__dirname, "../demo-app");

  router.use("/demo-app/assets", express.static(resolve(staticDir, "assets")));

  for (const version of DEMO_VERSIONS) {
    const serveApp: express.RequestHandler = (_req, res) => {
      res.sendFile(resolve(staticDir, "index.html"));
    };
    router.get(`/demo-app/${version}`, serveApp);
    router.get(`/demo-app/${version}/*`, serveApp);
  }

  router.get("/demo-app", (_req, res) => {
    res.redirect("/demo-app/v1");
  });

  const api = express.Router({ mergeParams: true });

  api.use((req, res, next) => {
    const version = (req.params as { version?: string }).version ?? "";
    if (!isVersion(version)) {
      return res.status(404).json({ error: "unknown version" });
    }
    ctx(req).faults = SERVER_FAULTS[version];
    next();
  });

  api.post("/login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "a valid email is required" });
    }
    if (typeof password !== "string" || password.length < 4) {
      return res.status(400).json({ error: "password is too short" });
    }
    const key = `${(req.params as { version?: string }).version}:${email.toLowerCase()}`;
    let account = accounts.get(key);
    if (!account) {
      account = { email, tasks: [] };
      accounts.set(key, account);
    }
    const token = randomUUID();
    sessions.set(token, account);
    res.json({ token, email });
  });

  api.use((req, res, next) => {
    const token = req.header("X-Session");
    const session = token ? sessions.get(token) : undefined;
    if (!session) return res.status(401).json({ error: "not authenticated" });
    ctx(req).session = session;
    next();
  });

  api.get("/tasks", async (req, res) => {
    const { faults, session } = ctx(req);
    if (faults.taskListDelayMs) await sleep(faults.taskListDelayMs);
    res.json(session.tasks);
  });

  api.post("/tasks", (req, res) => {
    const { session } = ctx(req);
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "title is required" });
    const task: Task = { id: randomUUID(), title, done: false };
    session.tasks.push(task);
    res.status(201).json(task);
  });

  api.patch("/tasks/:id", (req, res) => {
    const { faults, session } = ctx(req);
    const task = session.tasks.find((t) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: "task not found" });
    // v1 acknowledges the write and throws it away. The client already updated
    // optimistically, so nothing looks wrong until the page is reloaded.
    if (!faults.dropCompletionWrites && typeof req.body?.done === "boolean") {
      task.done = req.body.done;
    }
    res.json(task);
  });

  api.delete("/tasks/:id", (req, res) => {
    const { faults, session } = ctx(req);
    if (!session.tasks.some((t) => t.id === req.params.id)) {
      return res.status(404).json({ error: "task not found" });
    }
    // Same shape of bug as the completion write on v1: the client is told the
    // delete succeeded and removes the row, but the record is still there.
    if (!faults.dropDeletes) {
      session.tasks = session.tasks.filter((t) => t.id !== req.params.id);
    }
    res.json({ deleted: req.params.id });
  });

  api.get("/metrics", (req, res) => {
    const { faults, session } = ctx(req);
    if (faults.metricsServerError) {
      return res.status(500).json({ error: "metrics aggregation failed" });
    }
    const total = session.tasks.length;
    const completed = session.tasks.filter((t) => t.done).length;
    res.json({
      total,
      completed,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
    });
  });

  router.use("/api/demo-app/:version", api);
  return router;
}
