#!/usr/bin/env node
// Pre-demo checklist. Answers one question: if I press Run right now, will the
// evaluator drive a real browser, or quietly fall back to the synthetic engine?

import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { access, constants, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromium } from "./find-chromium.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 3000);

const results = [];
const ok = (name, detail) => results.push({ level: "ok", name, detail });
const warn = (name, detail, fix) => results.push({ level: "warn", name, detail, fix });
const bad = (name, detail, fix) => results.push({ level: "bad", name, detail, fix });

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok("Node", `v${process.versions.node}`);
  else bad("Node", `v${process.versions.node} is too old`, "Install Node 20 or newer.");
}

function checkDeps() {
  if (existsSync(resolve(root, "node_modules/express"))) {
    ok("Dependencies", "installed");
    return true;
  }
  bad("Dependencies", "node_modules is missing", "Run: npm install");
  return false;
}

async function checkBrowser() {
  const { source, path } = await resolveChromium();
  switch (source) {
    case "env":
      return ok("Chromium", `CHROMIUM_PATH → ${path}`);
    case "playwright":
      return ok("Chromium", "installed — evaluations will run for real");
    case "system":
      return ok("Chromium", `using this machine's browser → ${path}`);
    default:
      return bad(
        "Chromium",
        "no browser found, so runs would fall back to synthetic",
        "Run: npm run setup:browser",
      );
  }
}

function checkBuild() {
  if (existsSync(resolve(root, "dist/index.html"))) ok("Frontend build", "dist/ is present");
  else warn("Frontend build", "dist/ has not been built yet", "Run: npm run build");
}

async function checkDataDir() {
  const dir = resolve(root, "data");
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    const seeded = existsSync(resolve(dir, "vibetrace.db"));
    ok("Run database", seeded ? "writable, with saved history" : "writable, empty (will seed on boot)");
  } catch {
    bad("Run database", `${dir} is not writable`, "Check filesystem permissions.");
  }
}

function checkPort() {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => {
      warn(
        "Port",
        `${PORT} is already in use`,
        `Stop the other process, or start with: PORT=3001 npm run demo`,
      );
      done();
    });
    server.once("listening", () => {
      server.close(() => {
        ok("Port", `${PORT} is free`);
        done();
      });
    });
    server.listen(PORT, "0.0.0.0");
  });
}

checkNode();
const haveDeps = checkDeps();
if (haveDeps) await checkBrowser();
checkBuild();
await checkDataDir();
await checkPort();

const GLYPH = { ok: "  ok  ", warn: " warn ", bad: " FAIL " };
const COLOR = { ok: "\x1b[32m", warn: "\x1b[33m", bad: "\x1b[31m" };

console.log("\nVibeTrace preflight\n");
for (const r of results) {
  console.log(
    `${COLOR[r.level]}[${GLYPH[r.level]}]\x1b[0m ${r.name.padEnd(16)} ${r.detail}`,
  );
  if (r.fix) console.log(`${" ".repeat(25)}→ ${r.fix}`);
}

const failures = results.filter((r) => r.level === "bad");
console.log(
  failures.length
    ? `\n${failures.length} blocking issue(s). Fix the arrows above and re-run: npm run demo:check\n`
    : "\nReady. Start the demo with: npm run demo\n",
);
process.exit(failures.length ? 1 : 0);
