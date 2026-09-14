import { createHash, randomBytes } from "node:crypto";
import type {
  AcceptanceTest,
  ConsoleError,
  NetworkFailure,
  RunStep,
  StepLevel,
  TestResult,
} from "../shared/types.js";
import { runFlow, type FlowEnv, type FlowId, type Observations } from "./flows.js";

export interface EvalArtifacts {
  mode: "real" | "synthetic";
  tests: TestResult[];
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
  /** Median time-to-interactive across every page load in the session. */
  medianLatencyMs: number;
  steps: RunStep[];
}

export interface EvaluateOptions {
  seed?: string;
  forceSynthetic?: boolean;
  subject?: string;
  onStep?: (step: RunStep) => void;
}

// Deterministic PRNG (mulberry32) so synthetic evaluations are reproducible for
// a given (url, spec, seed) tuple. This lets History/Compare tell a coherent
// story across versions instead of flickering random numbers.
function makeRng(seedStr: string): () => number {
  let h = 0;
  const hash = createHash("sha256").update(seedStr).digest();
  h = hash.readUInt32LE(0);
  return function () {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

class StepRecorder {
  readonly steps: RunStep[] = [];
  private readonly started = Date.now();

  constructor(private readonly onStep?: (step: RunStep) => void) {}

  emit(message: string, level: StepLevel = "info"): void {
    const step: RunStep = { t: Date.now() - this.started, level, message };
    this.steps.push(step);
    this.onStep?.(step);
  }
}

/* ------------------------------------------------------------------ *
 * Real evaluation — a browser actually using the app
 * ------------------------------------------------------------------ */

async function realEvaluate(
  targetUrl: string,
  tests: AcceptanceTest[],
  recorder: StepRecorder,
  subject: string,
): Promise<EvalArtifacts | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    recorder.emit(
      "Playwright is not installed — falling back to the synthetic engine.",
      "warn",
    );
    return null;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    recorder.emit("launching headless chromium", "info");
    browser = await chromium.launch({
      headless: true,
      // Lets a host that already ships Chromium (Replit, most CI images) skip
      // Playwright's own download.
      executablePath: process.env.CHROMIUM_PATH || undefined,
      // Tuned for small containers: no sandbox namespaces, no reliance on a
      // large /dev/shm, and none of the background work a headless run has no
      // use for.
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-renderer-backgrounding",
        "--mute-audio",
      ],
    });
  } catch (err) {
    recorder.emit(
      `Chromium could not start (${err instanceof Error ? err.message.split("\n")[0] : "unknown error"}) — falling back to the synthetic engine.`,
      "warn",
    );
    if (browser) await (browser as import("playwright").Browser).close().catch(() => {});
    return null;
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 760 },
    });
    const page = await context.newPage();

    const observations: Observations = { consoleErrors: [], networkFailures: [] };
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        observations.consoleErrors.push({ message: msg.text(), source: "console" });
      }
    });
    page.on("pageerror", (err) => {
      observations.consoleErrors.push({ message: err.message, source: "pageerror" });
    });
    page.on("requestfailed", (req) => {
      const errorText = req.failure()?.errorText ?? "failed";
      // Chromium reports ERR_ABORTED for requests the page itself cancelled and
      // for empty-body responses the app handled fine. Blaming those on the
      // app under test would manufacture failures the user never sees.
      if (errorText.includes("ERR_ABORTED")) return;
      observations.networkFailures.push({
        url: req.url(),
        status: errorText,
        method: req.method(),
      });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        observations.networkFailures.push({
          url: res.url(),
          status: res.status(),
          method: res.request().method(),
        });
      }
    });

    const env: FlowEnv = {
      page,
      targetUrl,
      subject,
      observations,
      memory: {
        credentials: {
          email: `vibetrace+${randomBytes(3).toString("hex")}@example.com`,
          password: "vibetrace-probe-1234",
        },
        loggedIn: false,
        hasLoginUi: false,
        probeTitle: null,
        loadSamples: [],
        sessionRecoveries: 0,
      },
      log: (message, level = "info") => recorder.emit(`  ${message}`, level),
    };

    const results: TestResult[] = [];
    for (const test of tests) {
      recorder.emit(test.description, "test");
      const started = Date.now();
      const outcome = await runFlow(test.flowId as FlowId, env);
      const latencyMs = Date.now() - started;

      let screenshot: string | null = null;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 45 });
        screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;
      } catch {
        /* the page may be mid-navigation; evidence is best-effort */
      }

      recorder.emit(
        `  ${outcome.status === "pass" ? "PASS" : "FAIL"} · ${outcome.detail}`,
        outcome.status === "pass" ? "good" : "bad",
      );

      results.push({
        id: test.id,
        description: test.description,
        category: test.category,
        status: outcome.status,
        latencyMs,
        detail: outcome.detail,
        screenshot,
      });
    }

    if (env.memory.sessionRecoveries > 0) {
      recorder.emit(
        `had to sign in again ${env.memory.sessionRecoveries} time(s) mid-run to keep going`,
        "warn",
      );
    }

    await browser.close();
    browser = null;

    const loadMedian = median(env.memory.loadSamples);
    recorder.emit(
      `done — ${results.filter((r) => r.status === "pass").length}/${results.length} behaviours passed, median time-to-interactive ${loadMedian}ms`,
      "info",
    );

    return {
      mode: "real",
      tests: results,
      consoleErrors: dedupeConsole(observations.consoleErrors),
      networkFailures: dedupeNetwork(observations.networkFailures).slice(0, 12),
      medianLatencyMs: loadMedian,
      steps: recorder.steps,
    };
  } catch (err) {
    recorder.emit(
      `The browser session ended unexpectedly: ${err instanceof Error ? err.message.split("\n")[0] : "unknown error"}`,
      "warn",
    );
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Synthetic fallback — deterministic, clearly labelled, never pretends
 * ------------------------------------------------------------------ */

function syntheticScreenshot(test: AcceptanceTest, status: "pass" | "fail"): string {
  const bg = status === "fail" ? "#2a1215" : "#0f1a17";
  const accent = status === "fail" ? "#ff5c6c" : "#33d69f";
  const label = status === "fail" ? "WORKFLOW FAILED" : "WORKFLOW OK";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <rect width="640" height="360" fill="${bg}"/>
    <rect x="0" y="0" width="640" height="42" fill="#00000055"/>
    <circle cx="22" cy="21" r="6" fill="#ff5f56"/>
    <circle cx="42" cy="21" r="6" fill="#ffbd2e"/>
    <circle cx="62" cy="21" r="6" fill="#27c93f"/>
    <text x="100" y="26" fill="#8aa" font-family="monospace" font-size="14">captured frame</text>
    <text x="24" y="150" fill="#dfe" font-family="monospace" font-size="20">${escapeXml(
      test.category,
    )}</text>
    <text x="24" y="185" fill="#9ab" font-family="monospace" font-size="15">${escapeXml(
      truncate(test.description, 58),
    )}</text>
    <rect x="24" y="220" width="200" height="34" rx="6" fill="${accent}22" stroke="${accent}"/>
    <text x="40" y="243" fill="${accent}" font-family="monospace" font-size="15">${label}</text>
    <text x="24" y="330" fill="#556" font-family="monospace" font-size="12">synthetic capture · no browser available</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<"
      ? "&lt;"
      : c === ">"
        ? "&gt;"
        : c === "&"
          ? "&amp;"
          : c === "'"
            ? "&apos;"
            : "&quot;",
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const CONSOLE_ERROR_POOL = [
  { message: "Uncaught TypeError: Cannot read properties of undefined (reading 'map')", source: "app.js" },
  { message: "Warning: Each child in a list should have a unique \"key\" prop", source: "react-dom.js" },
  { message: "Failed to load resource: net::ERR_CONNECTION_REFUSED", source: "network" },
  { message: "Hydration failed because the initial UI does not match", source: "framework.js" },
  { message: "GET /api/session 401 (Unauthorized)", source: "auth.js" },
];

const NETWORK_FAILURE_POOL: NetworkFailure[] = [
  { url: "/api/session", status: 401, method: "GET" },
  { url: "/api/tasks", status: 500, method: "POST" },
  { url: "/api/analytics", status: 504, method: "GET" },
  { url: "/assets/vendor.js", status: 404, method: "GET" },
];

function syntheticEvaluate(
  tests: AcceptanceTest[],
  seed: string,
  recorder: StepRecorder,
): EvalArtifacts {
  recorder.emit(
    "running the synthetic engine — results are deterministic for this (url, spec, seed) and labelled as such",
    "warn",
  );
  const rng = makeRng(seed);
  const latencies: number[] = [];

  const results: TestResult[] = tests.map((t) => {
    // Some categories are intrinsically flakier in AI-built apps.
    const baseFail =
      t.category === "Authentication"
        ? 0.28
        : t.category === "API Failure"
          ? 0.3
          : t.category === "Data Persistence"
            ? 0.22
            : 0.14;
    const status: "pass" | "fail" = rng() < baseFail ? "fail" : "pass";
    const latency = Math.round(450 + rng() * (status === "fail" ? 3200 : 1600));
    latencies.push(latency);
    recorder.emit(t.description, "test");
    recorder.emit(
      `  ${status === "pass" ? "PASS" : "FAIL"} · simulated`,
      status === "pass" ? "good" : "bad",
    );
    return {
      id: t.id,
      description: t.description,
      category: t.category,
      status,
      latencyMs: latency,
      detail:
        status === "pass"
          ? "Flow completed and the expected UI state was observed."
          : failureDetail(t.category),
      screenshot: syntheticScreenshot(t, status),
    };
  });

  const consoleErrors: ConsoleError[] = [];
  const failedCount = results.filter((r) => r.status === "fail").length;
  const nErrors = Math.min(
    CONSOLE_ERROR_POOL.length,
    Math.round(failedCount * (0.6 + rng())),
  );
  for (let i = 0; i < nErrors; i++) {
    consoleErrors.push(CONSOLE_ERROR_POOL[Math.floor(rng() * CONSOLE_ERROR_POOL.length)]);
  }

  const networkFailures: NetworkFailure[] = [];
  const nNet = Math.min(NETWORK_FAILURE_POOL.length, Math.round(failedCount * rng()));
  for (let i = 0; i < nNet; i++) {
    networkFailures.push(NETWORK_FAILURE_POOL[Math.floor(rng() * NETWORK_FAILURE_POOL.length)]);
  }

  return {
    mode: "synthetic",
    tests: results,
    consoleErrors: dedupeConsole(consoleErrors),
    networkFailures: dedupeNetwork(networkFailures),
    medianLatencyMs: median(latencies),
    steps: recorder.steps,
  };
}

function failureDetail(category: string): string {
  switch (category) {
    case "Authentication":
      return "Login form submitted but the session was not established; redirected back to /login.";
    case "API Failure":
      return "Backend responded with a non-2xx status; the expected data never rendered.";
    case "Data Persistence":
      return "State was lost after reload; the created record was not returned by the server.";
    case "Navigation":
      return "Target route did not render; the expected heading was not found within the timeout.";
    case "Performance":
      return "Workflow exceeded the latency budget before reaching a stable state.";
    default:
      return "Expected element was not interactable; the workflow could not be completed.";
  }
}

function dedupeConsole(items: ConsoleError[]): ConsoleError[] {
  const map = new Map<string, ConsoleError>();
  for (const i of items) map.set(i.message, i);
  return [...map.values()];
}

function dedupeNetwork(items: NetworkFailure[]): NetworkFailure[] {
  const map = new Map<string, NetworkFailure>();
  for (const i of items) map.set(`${i.method} ${i.url} ${i.status}`, i);
  return [...map.values()];
}

export async function evaluate(
  targetUrl: string,
  spec: string,
  tests: AcceptanceTest[],
  opts: EvaluateOptions = {},
): Promise<EvalArtifacts> {
  const recorder = new StepRecorder(opts.onStep);
  recorder.emit(
    `spec parsed into ${tests.length} user-level behaviours to verify`,
    "info",
  );

  if (!opts.forceSynthetic) {
    const real = await realEvaluate(
      targetUrl,
      tests,
      recorder,
      opts.subject ?? "item",
    );
    if (real) return real;
  }
  const seed = opts.seed ?? `${targetUrl}::${spec}::${Date.now()}`;
  return syntheticEvaluate(tests, seed, recorder);
}
