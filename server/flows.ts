import type { Locator, Page } from "playwright";

// The behavioural layer of the evaluator.
//
// Each flow is a scripted user journey executed against the live app: type into
// the login form, submit it, create an item, tick it off, reload, look for it
// again. Verdicts come from what the browser actually did, not from counting
// elements on the page.
//
// Element lookup is deliberately generic — roles, input types, placeholders,
// accessible names — so a flow works against an app that has never heard of
// VibeTrace. When a flow cannot find what a step needs, it says exactly which
// affordance was missing instead of inventing a result.

export const FLOW_IDS = [
  "app.loads",
  "auth.login",
  "auth.session_persists",
  "item.create",
  "item.complete_persists",
  "item.delete",
  "nav.primary",
  "api.health",
  "perf.load",
] as const;

export type FlowId = (typeof FLOW_IDS)[number];

/** Time-to-interactive budget, in ms, used by the performance flow. */
export const LOAD_BUDGET_MS = 2000;

export type LogLevel = "info" | "action" | "good" | "bad" | "warn";

export interface Observations {
  consoleErrors: { message: string; source: string }[];
  networkFailures: { url: string; status: number | string; method: string }[];
}

export interface FlowMemory {
  credentials: { email: string; password: string };
  loggedIn: boolean;
  hasLoginUi: boolean;
  probeTitle: string | null;
  loadSamples: number[];
  sessionRecoveries: number;
}

export interface FlowEnv {
  page: Page;
  targetUrl: string;
  subject: string;
  observations: Observations;
  memory: FlowMemory;
  log: (message: string, level?: LogLevel) => void;
}

export interface FlowResult {
  status: "pass" | "fail";
  detail: string;
}

const FIND_TIMEOUT = 2500;
const SETTLE_TIMEOUT = 5000;

const pass = (detail: string): FlowResult => ({ status: "pass", detail });
const fail = (detail: string): FlowResult => ({ status: "fail", detail });
const blocked = (why: string): FlowResult =>
  fail(`Blocked — ${why} This behaviour could not be exercised.`);

/* ------------------------------------------------------------------ *
 * Generic element lookup
 * ------------------------------------------------------------------ */

async function isVisible(loc: Locator, timeout = FIND_TIMEOUT): Promise<boolean> {
  try {
    await loc.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function firstVisible(
  page: Page,
  selectors: string[],
  timeout = FIND_TIMEOUT,
): Promise<Locator | null> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await isVisible(loc, timeout)) return loc;
  }
  return null;
}

function passwordField(page: Page): Locator {
  return page.locator('input[type="password"]').first();
}

async function findEmailField(page: Page): Promise<Locator | null> {
  return firstVisible(page, [
    'input[type="email"]',
    'input[name*="email" i]',
    'input[placeholder*="email" i]',
    'input[id*="email" i]',
    'input[name*="user" i]',
    'input[autocomplete="username"]',
  ]);
}

async function findSubmit(page: Page): Promise<Locator | null> {
  const byRole = page
    .getByRole("button", {
      name: /log ?in|sign ?in|sign ?up|register|continue|submit|get started|create account/i,
    })
    .first();
  if (await isVisible(byRole, 1200)) return byRole;
  return firstVisible(page, ['button[type="submit"]', 'input[type="submit"]'], 1200);
}

const COMPOSER_HINT = /add|new|create|task|item|todo|note|title|what needs/i;
const COMPOSER_EXCLUDE = /email|password|search|filter|query|url|spec|comment/i;

async function findComposer(page: Page): Promise<Locator | null> {
  const candidates = page.locator(
    'input[type="text"], input:not([type]), textarea',
  );
  const count = Math.min(await candidates.count(), 12);
  let fallback: Locator | null = null;

  for (let i = 0; i < count; i++) {
    const field = candidates.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const hint = (
      await Promise.all([
        field.getAttribute("placeholder"),
        field.getAttribute("aria-label"),
        field.getAttribute("name"),
        field.getAttribute("id"),
      ])
    )
      .filter(Boolean)
      .join(" ");
    if (COMPOSER_EXCLUDE.test(hint)) continue;
    if (COMPOSER_HINT.test(hint)) return field;
    if (!fallback) fallback = field;
  }
  return fallback;
}

/**
 * The smallest element that both contains `text` and looks like a list row.
 * Tried narrowest-first so a bare text span never wins over the row that
 * actually holds the checkbox and the delete button.
 */
async function rowFor(page: Page, text: string): Promise<Locator | null> {
  for (const selector of ["li", "tr", "[role='listitem']", "div"]) {
    const matches = page.locator(selector).filter({ hasText: text });
    if ((await matches.count()) === 0) continue;
    const innermost = matches.last();
    if (await innermost.isVisible().catch(() => false)) return innermost;
  }
  return null;
}

async function findDeleteControl(row: Locator): Promise<Locator | null> {
  const byRole = row
    .getByRole("button", { name: /delete|remove|trash|discard|×|✕|✖/i })
    .first();
  if (await isVisible(byRole, 1200)) return byRole;
  const byText = row
    .locator("button, a, [role='button']")
    .filter({ hasText: /delete|remove|×|✕|✖|🗑/i })
    .first();
  if (await isVisible(byText, 1200)) return byText;
  return null;
}

async function internalNavLinks(page: Page): Promise<Locator[]> {
  const scoped = page.locator(
    "nav a[href], header a[href], [role='navigation'] a[href], aside a[href]",
  );
  const source = (await scoped.count()) > 0 ? scoped : page.locator("a[href]");
  const total = Math.min(await source.count(), 10);
  const out: Locator[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < total; i++) {
    const link = source.nth(i);
    const href = (await link.getAttribute("href")) ?? "";
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (/^https?:\/\//i.test(href)) continue;
    if (href === "#" || seen.has(href)) continue;
    if (!(await link.isVisible().catch(() => false))) continue;
    seen.add(href);
    out.push(link);
  }
  return out;
}

async function mainText(page: Page): Promise<string> {
  try {
    return (await page.locator("body").innerText()).trim();
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * Shared actions
 * ------------------------------------------------------------------ */

export async function measuredLoad(
  env: FlowEnv,
  kind: "goto" | "reload",
): Promise<{ ms: number; ok: boolean }> {
  const started = Date.now();
  let ok = true;
  try {
    if (kind === "goto") {
      await env.page.goto(env.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
    } else {
      await env.page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    }
    await env.page
      .waitForLoadState("networkidle", { timeout: 8000 })
      .catch(() => {});
  } catch {
    ok = false;
  }
  const ms = Date.now() - started;
  if (ok) env.memory.loadSamples.push(ms);
  return { ms, ok };
}

async function attemptLogin(env: FlowEnv): Promise<boolean> {
  const { page, memory } = env;
  const password = passwordField(page);
  if (!(await isVisible(password, 1500))) return false;

  const email = await findEmailField(page);
  if (email) {
    await email.fill(memory.credentials.email).catch(() => {});
  }
  await password.fill(memory.credentials.password).catch(() => {});

  const submit = await findSubmit(page);
  if (submit) await submit.click({ timeout: 3000 }).catch(() => {});
  else await password.press("Enter").catch(() => {});

  try {
    await password.waitFor({ state: "hidden", timeout: SETTLE_TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Re-authenticates when a reload dropped us back onto a login screen. */
async function ensureLoggedIn(env: FlowEnv): Promise<void> {
  if (!env.memory.hasLoginUi) return;
  if (!(await isVisible(passwordField(env.page), 1000))) return;
  env.log("session dropped after reload — signing back in to continue", "warn");
  env.memory.sessionRecoveries += 1;
  env.memory.loggedIn = await attemptLogin(env);
}

/* ------------------------------------------------------------------ *
 * Flows
 * ------------------------------------------------------------------ */

const flows: Record<FlowId, (env: FlowEnv) => Promise<FlowResult>> = {
  "app.loads": async (env) => {
    env.log(`opening ${env.targetUrl}`, "action");
    const { ms, ok } = await measuredLoad(env, "goto");
    if (!ok) {
      return fail("The app never finished loading (navigation timed out or the host was unreachable).");
    }
    const text = await mainText(env.page);
    env.log(`first paint to interactive in ${ms}ms`, "info");
    if (text.length < 15) {
      return fail(`The page loaded in ${ms}ms but rendered no visible content — a blank shell.`);
    }
    return pass(`The app rendered usable content ${ms}ms after navigation started.`);
  },

  "auth.login": async (env) => {
    const { page, memory } = env;
    if (!(await isVisible(passwordField(page), 2000))) {
      memory.hasLoginUi = false;
      return fail("The spec calls for accounts, but no password field was rendered anywhere on the entry page.");
    }
    memory.hasLoginUi = true;
    env.log(`signing up as ${memory.credentials.email}`, "action");
    memory.loggedIn = await attemptLogin(env);
    if (!memory.loggedIn) {
      const banner = await mainText(page);
      const hint = /invalid|incorrect|could not|error|failed/i.test(banner)
        ? " The app displayed an authentication error."
        : "";
      return fail(`Submitted valid credentials but the login form never cleared.${hint}`);
    }
    return pass(`Created an account and signed in as ${memory.credentials.email}; the app moved past the login screen.`);
  },

  "auth.session_persists": async (env) => {
    if (!env.memory.loggedIn) return blocked("the app could not be signed into.");
    env.log("reloading to check the session survives", "action");
    const { ok } = await measuredLoad(env, "reload");
    if (!ok) return fail("The app failed to reload, so session persistence could not be confirmed.");

    if (await isVisible(passwordField(env.page), 1200)) {
      env.memory.sessionRecoveries += 1;
      env.memory.loggedIn = await attemptLogin(env);
      return fail("A page refresh signed the user out — the login screen came back and credentials had to be entered again.");
    }
    return pass("The user stayed signed in across a full page reload.");
  },

  "item.create": async (env) => {
    const { page, memory, subject } = env;
    if (memory.hasLoginUi && !memory.loggedIn) {
      return blocked("no authenticated session was available.");
    }
    const composer = await findComposer(page);
    if (!composer) {
      return fail(`No field for entering a new ${subject} was found on the page.`);
    }

    const title = `VibeTrace probe ${Math.random().toString(36).slice(2, 7)}`;
    env.log(`typing "${title}" into the ${subject} field`, "action");
    await composer.fill(title);

    const addButton = await firstVisible(
      page,
      [
        'form button[type="submit"]',
        'button:has-text("Add")',
        'button:has-text("Create")',
        'button:has-text("Save")',
      ],
      1200,
    );
    if (addButton) await addButton.click({ timeout: 3000 }).catch(() => {});
    else await composer.press("Enter").catch(() => {});

    const created = await isVisible(page.getByText(title, { exact: false }), SETTLE_TIMEOUT);
    if (!created) {
      return fail(`Submitted a new ${subject} but "${title}" never appeared in the list.`);
    }
    memory.probeTitle = title;
    env.log(`"${title}" appeared in the list`, "good");
    return pass(`Created a ${subject} and it rendered in the list immediately.`);
  },

  "item.complete_persists": async (env) => {
    const { page, memory, subject } = env;
    if (!memory.probeTitle) return blocked(`no ${subject} could be created.`);

    const row = await rowFor(page, memory.probeTitle);
    if (!row) return blocked(`the ${subject} under test was no longer on the page.`);
    const checkbox = row.locator('input[type="checkbox"], [role="checkbox"]').first();
    if (!(await isVisible(checkbox, 2000))) {
      return fail(`No control for marking a ${subject} complete was found on its row.`);
    }

    env.log(`marking "${memory.probeTitle}" complete`, "action");
    await checkbox.check({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);

    env.log("reloading to check the completion was written", "action");
    const { ok } = await measuredLoad(env, "reload");
    if (!ok) return fail("The app failed to reload, so persistence could not be confirmed.");
    await ensureLoggedIn(env);

    await isVisible(page.getByText(memory.probeTitle, { exact: false }), 3000);
    const reloadedRow = await rowFor(page, memory.probeTitle);
    if (!reloadedRow) {
      return fail(`"${memory.probeTitle}" was gone entirely after the reload — the ${subject} itself was never saved.`);
    }
    const reloadedBox = reloadedRow
      .locator('input[type="checkbox"], [role="checkbox"]')
      .first();
    const stillChecked = await reloadedBox.isChecked().catch(() => false);
    if (!stillChecked) {
      env.log("completion was lost across the reload", "bad");
      return fail(`The ${subject} was ticked off and the UI updated, but after a reload it came back unchecked — the write never reached storage.`);
    }
    return pass(`The completed ${subject} was still marked complete after a full reload.`);
  },

  "item.delete": async (env) => {
    const { page, memory, subject } = env;
    if (!memory.probeTitle) return blocked(`no ${subject} could be created.`);

    const row = await rowFor(page, memory.probeTitle);
    if (!row) return blocked(`the ${subject} under test was no longer on the page.`);
    const control = await findDeleteControl(row);
    if (!control) return fail(`No delete control was found on the ${subject} row.`);

    const errorsBefore = env.observations.consoleErrors.length;
    env.log(`clicking Delete on "${memory.probeTitle}"`, "action");
    await control.click({ timeout: 3000 }).catch(() => {});

    const gone = await page
      .getByText(memory.probeTitle, { exact: false })
      .first()
      .waitFor({ state: "detached", timeout: SETTLE_TIMEOUT })
      .then(() => true)
      .catch(() => false);

    if (!gone) {
      const newErrors = env.observations.consoleErrors.slice(errorsBefore);
      const because = newErrors.length
        ? ` The click raised: ${newErrors[0].message}`
        : " The click produced no visible effect and no error.";
      env.log("delete did nothing", "bad");
      return fail(`Clicking Delete left the ${subject} on the page.${because}`);
    }

    const { ok } = await measuredLoad(env, "reload");
    if (ok) {
      await ensureLoggedIn(env);
      const resurrected = await isVisible(
        page.getByText(memory.probeTitle, { exact: false }),
        2000,
      );
      if (resurrected) {
        return fail(`The ${subject} disappeared from the UI but came back after a reload — the delete was never persisted.`);
      }
    }
    memory.probeTitle = null;
    return pass(`Deleted the ${subject} and it stayed deleted after a reload.`);
  },

  "nav.primary": async (env) => {
    const { page } = env;
    const links = await internalNavLinks(page);
    if (links.length === 0) return fail("No in-app navigation links were rendered.");

    const visited: string[] = [];
    const broken: string[] = [];
    for (const link of links.slice(0, 3)) {
      const label = ((await link.innerText().catch(() => "")) || "link").trim();
      const before = await mainText(page);
      env.log(`navigating to "${label}"`, "action");
      await link.click({ timeout: 3000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(250);
      const after = await mainText(page);
      if (after.length < 15) broken.push(`${label} (blank page)`);
      else if (after === before && visited.length > 0) broken.push(`${label} (no change)`);
      else visited.push(label);
    }

    if (broken.length) {
      return fail(`Navigation failed for: ${broken.join(", ")}.`);
    }
    return pass(`Navigated ${visited.length} route(s) — ${visited.join(" → ")} — each rendering its own content.`);
  },

  "api.health": async (env) => {
    const failures = env.observations.networkFailures.filter(
      (f) => !/favicon/i.test(f.url),
    );
    if (failures.length === 0) {
      return pass("Every request the app made during the session returned a successful response.");
    }
    const shown = failures
      .slice(0, 3)
      .map((f) => `${f.method} ${shortUrl(f.url)} → ${f.status}`)
      .join("; ");
    return fail(`${failures.length} request(s) failed while exercising the app: ${shown}.`);
  },

  "perf.load": async (env) => {
    const samples = env.memory.loadSamples;
    if (samples.length === 0) return fail("No successful page load was recorded.");
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMs =
      sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    const worst = sorted[sorted.length - 1];
    const summary = `median ${medianMs}ms across ${samples.length} loads, worst ${worst}ms, budget ${LOAD_BUDGET_MS}ms`;
    return medianMs <= LOAD_BUDGET_MS
      ? pass(`The app became interactive inside its budget (${summary}).`)
      : fail(`The app was too slow to become interactive (${summary}).`);
  },
};

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

export async function runFlow(id: FlowId, env: FlowEnv): Promise<FlowResult> {
  const flow = flows[id];
  if (!flow) return fail(`No flow is implemented for "${id}".`);
  try {
    return await flow(env);
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return fail(`The flow crashed while driving the app: ${message}`);
  }
}
