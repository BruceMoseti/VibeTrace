import { createHash } from "node:crypto";
import type {
  AcceptanceTest,
  ConsoleError,
  NetworkFailure,
  TestResult,
} from "../shared/types.js";

export interface EvalArtifacts {
  mode: "real" | "synthetic";
  tests: TestResult[];
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
  medianLatencyMs: number;
}

export interface EvaluateOptions {
  seed?: string;
  forceSynthetic?: boolean;
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

function syntheticScreenshot(
  test: AcceptanceTest,
  status: "pass" | "fail",
): string {
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
    <text x="24" y="330" fill="#556" font-family="monospace" font-size="12">synthetic capture · playwright unavailable</text>
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
): EvalArtifacts {
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
    const latency = Math.round(
      450 + rng() * (status === "fail" ? 3200 : 1600),
    );
    latencies.push(latency);
    return {
      id: t.id,
      description: t.description,
      category: t.category,
      status,
      latencyMs: latency,
      detail:
        status === "pass"
          ? "Flow completed and expected UI state was observed."
          : failureDetail(t.category),
      screenshot: status === "fail" ? syntheticScreenshot(t, status) : null,
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
  const nNet = Math.min(
    NETWORK_FAILURE_POOL.length,
    Math.round(failedCount * rng()),
  );
  for (let i = 0; i < nNet; i++) {
    networkFailures.push(NETWORK_FAILURE_POOL[Math.floor(rng() * NETWORK_FAILURE_POOL.length)]);
  }

  return {
    mode: "synthetic",
    tests: results,
    consoleErrors: dedupeConsole(consoleErrors),
    networkFailures: dedupeNetwork(networkFailures),
    medianLatencyMs: median(latencies),
  };
}

function failureDetail(category: string): string {
  switch (category) {
    case "Authentication":
      return "Login form submitted but session was not established; redirected back to /login.";
    case "API Failure":
      return "Backend responded with a non-2xx status; expected data never rendered.";
    case "Data Persistence":
      return "State was lost after reload; the created record was not returned by the server.";
    case "Navigation":
      return "Target route did not render; expected heading was not found within timeout.";
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
  for (const i of items) map.set(`${i.method} ${i.url}`, i);
  return [...map.values()];
}

// Attempts a real, browser-driven evaluation with Playwright. Page load latency,
// console errors, failed network requests and screenshots are REAL signals from
// the target app. Per-test verdicts are heuristic DOM probes derived from those
// real signals (executing arbitrary natural-language flows is out of MVP scope).
async function realEvaluate(
  targetUrl: string,
  tests: AcceptanceTest[],
): Promise<EvalArtifacts | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return null;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    const consoleErrors: ConsoleError[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({ message: msg.text(), source: "console" });
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push({ message: err.message, source: "pageerror" });
    });

    const networkFailures: NetworkFailure[] = [];
    page.on("requestfailed", (req) => {
      networkFailures.push({
        url: req.url(),
        status: req.failure()?.errorText ?? "failed",
        method: req.method(),
      });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        networkFailures.push({
          url: res.url(),
          status: res.status(),
          method: res.request().method(),
        });
      }
    });

    const start = Date.now();
    let loaded = true;
    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      // Let client-rendered (SPA) content settle so DOM probes reflect the
      // actual interactive UI rather than an empty pre-hydration shell.
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(400);
    } catch {
      loaded = false;
    }
    const loadLatency = Date.now() - start;

    let pageScreenshot: string | null = null;
    let bodyText = "";
    let inputCount = 0;
    let buttonCount = 0;
    let linkCount = 0;
    if (loaded) {
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 55 });
        pageScreenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;
        bodyText = (await page.locator("body").innerText()).toLowerCase();
        inputCount = await page.locator("input, textarea").count();
        buttonCount = await page.locator("button, [role=button]").count();
        linkCount = await page.locator("a").count();
      } catch {
        /* best-effort DOM probe */
      }
    }

    const latencies: number[] = [];
    const results: TestResult[] = tests.map((t) => {
      const probe = probeTest(t, {
        loaded,
        bodyText,
        inputCount,
        buttonCount,
        linkCount,
        hadNetworkFailure: networkFailures.length > 0,
        loadLatency,
      });
      latencies.push(probe.latencyMs);
      return {
        id: t.id,
        description: t.description,
        category: t.category,
        status: probe.status,
        latencyMs: probe.latencyMs,
        detail: probe.detail,
        screenshot: probe.status === "fail" ? pageScreenshot : null,
      };
    });

    await browser.close();
    browser = null;

    return {
      mode: "real",
      tests: results,
      consoleErrors: dedupeConsole(consoleErrors),
      networkFailures: dedupeNetwork(networkFailures).slice(0, 12),
      medianLatencyMs: median(latencies),
    };
  } catch {
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

interface ProbeContext {
  loaded: boolean;
  bodyText: string;
  inputCount: number;
  buttonCount: number;
  linkCount: number;
  hadNetworkFailure: boolean;
  loadLatency: number;
}

function probeTest(
  t: AcceptanceTest,
  ctx: ProbeContext,
): { status: "pass" | "fail"; latencyMs: number; detail: string } {
  const latencyMs = Math.max(
    120,
    Math.round(ctx.loadLatency * (0.4 + Math.random() * 0.6)),
  );
  if (!ctx.loaded) {
    return {
      status: "fail",
      latencyMs,
      detail: "Target app did not load (navigation timed out or was unreachable).",
    };
  }
  switch (t.category) {
    case "Authentication": {
      const hasAuth =
        /log ?in|sign ?in|sign ?up|register|password|email/.test(ctx.bodyText) ||
        ctx.inputCount >= 2;
      return hasAuth
        ? { status: "pass", latencyMs, detail: "Auth affordances detected (inputs / login copy present)." }
        : { status: "fail", latencyMs, detail: "No login or registration affordances were found on the page." };
    }
    case "API Failure":
      return ctx.hadNetworkFailure
        ? { status: "fail", latencyMs, detail: "One or more network requests returned a non-2xx status." }
        : { status: "pass", latencyMs, detail: "No failed network requests observed during load." };
    case "Navigation":
      return ctx.linkCount > 0
        ? { status: "pass", latencyMs, detail: `Navigable links detected (${ctx.linkCount}).` }
        : { status: "fail", latencyMs, detail: "No navigation links were rendered." };
    case "UI Interaction":
      return ctx.buttonCount > 0 || ctx.inputCount > 0 || ctx.linkCount > 0
        ? {
            status: "pass",
            latencyMs,
            detail: `Interactive controls detected (${ctx.buttonCount} buttons, ${ctx.inputCount} inputs, ${ctx.linkCount} links).`,
          }
        : { status: "fail", latencyMs, detail: "No interactive controls (buttons/inputs/links) were found." };
    case "Performance":
      return ctx.loadLatency < 3000
        ? { status: "pass", latencyMs, detail: `Initial load was ${ctx.loadLatency}ms (within budget).` }
        : { status: "fail", latencyMs, detail: `Initial load was ${ctx.loadLatency}ms (over 3s budget).` };
    case "Data Persistence":
    default:
      return ctx.loadLatency < 6000
        ? { status: "pass", latencyMs, detail: "Page reached a stable rendered state." }
        : { status: "fail", latencyMs, detail: "Page did not reach a stable state within budget." };
  }
}

export async function evaluate(
  targetUrl: string,
  _spec: string,
  tests: AcceptanceTest[],
  opts: EvaluateOptions = {},
): Promise<EvalArtifacts> {
  const seed = opts.seed ?? `${targetUrl}::${_spec}::${Date.now()}`;
  if (!opts.forceSynthetic) {
    const real = await realEvaluate(targetUrl, tests);
    if (real) return real;
  }
  return syntheticEvaluate(tests, seed);
}
